import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import type { ICradle } from "../../../shared/di/container.types";
import {
	InvalidCredentialsError,
	InvalidSessionError,
	PlatformLockedError,
	SessionExpiredError,
	TokenReuseError,
	TooManyAttemptsError,
} from "../domain/auth.errors";
import type { AuthService } from "../domain/auth.service";
import type {
	AccessTokenPayload,
	AuthTokens,
	LoginDto,
	RefreshResult,
} from "../domain/auth.types";
import { validateAccessTokenPayload } from "../domain/auth.validators";
import { isLockedOutForRole } from "../domain/security-state.rules";

type Dependencies = {
	sessionRepository: ICradle["sessionRepository"];
	tokenService: ICradle["tokenService"];
	userRepository: ICradle["userRepository"];
	passwordService: ICradle["passwordService"];
	singleFlight: ICradle["singleFlight"];
	rateLimiter: ICradle["rateLimiter"];
	logger: ICradle["logger"];
	authConfig: ICradle["authConfig"];
	securityStateRepository: ICradle["securityStateRepository"];
};

// Hash dummy para igualar el timing del login cuando el email no existe.
// Memo a nivel de módulo: bcrypt corre UNA vez por proceso, no por petición.
let dummyHashPromise: Promise<string> | undefined;
const getDummyHash = (passwordService: Dependencies["passwordService"]) => {
	dummyHashPromise ??= passwordService.hash("__timing-equalizer-dummy__");
	return dummyHashPromise;
};

export const createAuthService = ({
	sessionRepository,
	tokenService,
	userRepository,
	passwordService,
	singleFlight,
	rateLimiter,
	logger,
	authConfig,
	securityStateRepository,
}: Dependencies): AuthService => {
	const log = logger.child({ module: "auth" });
	const graceMs = authConfig.refreshGraceS * 1000;

	// Solo envuelve las operaciones que consume un action. `refresh` y
	// `verifyAccessToken` siguen lanzando a propósito — ver auth.service.ts.
	const run = createOperationRunner(log);

	// Único sitio que arma el payload a firmar, así que login y las dos ramas del
	// refresh heredan cualquier claim nuevo sin tocarse.
	const buildPayload = (
		user: {
			documentId: string;
			id?: number;
			email: string;
			role: string;
			dependencyId: number | null;
			isTrainer: boolean;
		},
		userId: number,
	): AccessTokenPayload =>
		// Valida contra el esquema (picklist de roles incluido) antes de firmar.
		validateAccessTokenPayload({
			sub: user.documentId,
			userId,
			email: user.email,
			role: user.role,
			dependencyId: user.dependencyId,
			isTrainer: user.isTrainer,
		});

	// ── Login ────────────────────────────────────────────────────────────────────
	const performLogin = async (
		dto: LoginDto,
		meta: { userAgent?: string; ipAddress?: string },
	): Promise<AuthTokens> => {
		const securitySnapshot = await securityStateRepository.get();

		// Alcance `all`: corta ANTES del rate limiter y de bcrypt — durante un
		// incidente no interesa gastar CPU verificando contraseñas que se
		// rechazarán igual (docs/auth/02 §B.3). Con `except-admin` no se puede
		// saber el rol todavía, así que ese corte va más abajo, tras resolver
		// el usuario.
		if (
			securitySnapshot.lockdownAt &&
			securitySnapshot.lockdownScope === "all"
		) {
			throw new PlatformLockedError();
		}

		// Rate limiting por email y por IP (la IP es informativa/espoofable sin
		// proxy de confianza; por eso el límite por email es el estricto).
		const windowMs = authConfig.loginWindowS * 1000;
		const decisions = [
			rateLimiter.consume(`auth:login:email:${dto.email}`, {
				limit: authConfig.loginMaxPerEmail,
				windowMs,
			}),
			...(meta.ipAddress
				? [
						rateLimiter.consume(`auth:login:ip:${meta.ipAddress}`, {
							limit: authConfig.loginMaxPerIp,
							windowMs,
						}),
					]
				: []),
		];
		const blocked = decisions.find((d) => !d.allowed);
		if (blocked) {
			log.warn("login rate limit exceeded");
			throw new TooManyAttemptsError(blocked.retryAfterMs);
		}

		const user = await userRepository.findByEmail(dto.email);

		// Timing-safe: SIEMPRE se ejecuta un bcrypt.compare, exista o no el
		// usuario — un email no registrado tarda lo mismo que uno registrado.
		const hashed = user?.password ?? (await getDummyHash(passwordService));
		const valid = await passwordService.compare(dto.password, hashed);

		if (!user?.password || !valid) {
			throw new InvalidCredentialsError();
		}

		// Una cuenta archivada no entra. Se comprueba DESPUÉS del bcrypt.compare a
		// propósito: hacerlo antes ahorraría el hash y haría que una cuenta
		// desactivada respondiera más rápido que una activa, que es un oráculo de
		// enumeración por tiempo.
		//
		// Y responde `InvalidCredentialsError`, no un código propio: "esta cuenta
		// existe pero está desactivada" es exactamente lo que no se le puede confirmar
		// a quien prueba correos. El motivo real queda en el log, que es donde le
		// sirve a quien opera.
		if (user.archivedAt) {
			log.warn("login rejected: archived account", { userId: user.id });
			throw new InvalidCredentialsError();
		}

		// Alcance `except-admin`: el corte llega hasta aquí porque el rol solo se
		// conoce tras resolver el usuario. El camino es indistinguible en timing
		// del de credenciales inválidas — ya se pagó el mismo bcrypt.compare.
		if (isLockedOutForRole(securitySnapshot, user.role)) {
			throw new PlatformLockedError();
		}

		const refreshToken = tokenService.generateRefreshToken();
		const accessToken = await tokenService.signAccessToken(
			buildPayload(user, user.id),
		);

		await sessionRepository.create({
			userId: user.id,
			refreshTokenHash: tokenService.hashRefreshToken(refreshToken),
			expiresAt: tokenService.getRefreshTokenExpiry(),
			userAgent: meta.userAgent,
			ipAddress: meta.ipAddress,
		});

		// Cap de sesiones: conserva las N más recientes (incluida la recién
		// creada) — evita crecimiento sin cota por bots o logins repetidos.
		await sessionRepository.deleteOldestExceeding({
			userId: user.id,
			keep: authConfig.maxSessionsPerUser,
		});

		return { accessToken, refreshToken };
	};

	const login: AuthService["login"] = (dto, meta) =>
		run("login", async () => ok(await performLogin(dto, meta)));

	// ── Refresh (idempotente) ────────────────────────────────────────────────────
	// Rotación con: single-flight (capa 1 — N peticiones concurrentes/rezagadas
	// comparten UNA rotación), compare-and-swap en DB (capa 2 — carrera entre
	// procesos) y ventana de gracia + detección de reuso (capa 3).
	// Diseño: docs/auth/00-sistema-autenticacion.md §6.2

	const rotate = async (
		incomingHash: string,
		attempt = 0,
	): Promise<RefreshResult> => {
		const session = await sessionRepository.findByTokenHash(incomingHash);

		// Hash desconocido: token inválido/corrupto o sesión ya revocada.
		if (!session) {
			throw new InvalidSessionError();
		}

		const now = new Date();

		// ── Coincide con el token VIGENTE → rotación normal ─────────────────────
		if (session.refreshTokenHash === incomingHash) {
			if (session.expiresAt < now) {
				await sessionRepository.deleteById(session.id);
				throw new SessionExpiredError();
			}

			// Fetch fresh user data — the access token always reflects current role/email.
			const user = await userRepository.findByInternalId(session.userId);
			if (!user) {
				await sessionRepository.deleteById(session.id);
				throw new InvalidSessionError();
			}

			// Archivar revoca el epoch, pero eso solo mata el access token EN CURSO: sin
			// esta comprobación, el refresh seguiría emitiendo uno nuevo cada vez y la
			// cuenta desactivada no perdería el acceso nunca. Se borran todas sus
			// sesiones para que no quede ninguna con la que volver a intentarlo.
			if (user.archivedAt) {
				log.warn("refresh rejected: archived account", { userId: user.id });
				await sessionRepository.deleteAllByUserId(session.userId);
				throw new InvalidSessionError();
			}

			// Alcance `except-admin`: aquí sí se conoce el rol. El alcance `all` ya
			// cortó al principio de `refresh`, antes del single-flight.
			if (isLockedOutForRole(await securityStateRepository.get(), user.role)) {
				throw new PlatformLockedError();
			}

			const newRefreshToken = tokenService.generateRefreshToken();
			const outcome = await sessionRepository.rotateIfCurrent({
				sessionId: session.id,
				expectedTokenHash: incomingHash,
				newTokenHash: tokenService.hashRefreshToken(newRefreshToken),
				newExpiresAt: tokenService.getRefreshTokenExpiry(),
				rotatedAt: now,
			});

			if (outcome === "stale") {
				// Otro proceso rotó entre la lectura y el update — re-evaluar UNA vez:
				// el hash entrante ahora debería caer en la rama de gracia.
				if (attempt > 0) throw new InvalidSessionError();
				return rotate(incomingHash, attempt + 1);
			}

			const accessToken = await tokenService.signAccessToken(
				buildPayload(user, session.userId),
			);
			return { accessToken, refreshToken: newRefreshToken };
		}

		// ── Coincide con el token ANTERIOR (prevTokenHash) ───────────────────────
		const withinGrace =
			session.rotatedAt !== null &&
			now.getTime() - session.rotatedAt.getTime() <= graceMs;

		if (withinGrace) {
			// Hit de gracia (fallback vía DB): un cliente rezagado con el token ya
			// rotado. No se rota de nuevo ni se puede reemitir el refresh vigente
			// (en DB solo hay hashes) — solo access token; la cookie de refresh del
			// cliente converge en su próximo refresh.
			if (session.expiresAt < now) throw new SessionExpiredError();
			const user = await userRepository.findByInternalId(session.userId);
			if (!user) throw new InvalidSessionError();

			// La misma comprobación que en la rotación normal, y por el mismo motivo:
			// la ventana de gracia es otro camino que emite access tokens, así que
			// cerrar solo uno de los dos no cierra nada.
			if (user.archivedAt) {
				log.warn("refresh grace rejected: archived account", {
					userId: user.id,
				});
				await sessionRepository.deleteAllByUserId(session.userId);
				throw new InvalidSessionError();
			}

			if (isLockedOutForRole(await securityStateRepository.get(), user.role)) {
				throw new PlatformLockedError();
			}

			log.debug("refresh grace hit (DB fallback)", { sessionId: session.id });
			const accessToken = await tokenService.signAccessToken(
				buildPayload(user, session.userId),
			);
			return { accessToken, refreshToken: null };
		}

		// ── Reuso fuera de la gracia → robo presunto ─────────────────────────────
		// OAuth 2.1: revocar la familia completa de sesiones del usuario.
		log.warn("refresh token reuse detected — revoking all user sessions", {
			userId: session.userId,
		});
		await sessionRepository.deleteAllByUserId(session.userId);
		throw new TokenReuseError();
	};

	const refresh = async (
		incomingRefreshToken: string,
	): Promise<RefreshResult> => {
		// Alcance `all`: corta ANTES del single-flight — así ni siquiera se cachea
		// el intento. `except-admin` no puede saberse aquí (no hay rol todavía) y
		// se corta dentro de `rotate`, en las dos ramas que resuelven el usuario.
		const securitySnapshot = await securityStateRepository.get();
		if (
			securitySnapshot.lockdownAt &&
			securitySnapshot.lockdownScope === "all"
		) {
			throw new PlatformLockedError();
		}

		const incomingHash = tokenService.hashRefreshToken(incomingRefreshToken);
		// El hash del token entrante ES la clave de idempotencia. El resultado
		// queda cacheado toda la ventana de gracia: concurrentes y rezagados
		// reciben el MISMO par de tokens.
		return singleFlight.run(`auth:refresh:${incomingHash}`, graceMs, () =>
			rotate(incomingHash),
		);
	};

	// ── Logout ───────────────────────────────────────────────────────────────────
	// Idempotente: una sesión ya revocada no es un fallo. Lo que sí puede fallar
	// es la base de datos, y entonces la respuesta lo dice en vez de que el action
	// tenga que rodearlo de un try/catch.
	const logout: AuthService["logout"] = (refreshToken) =>
		run("logout", async () => {
			const session = await sessionRepository.findByTokenHash(
				tokenService.hashRefreshToken(refreshToken),
			);
			if (session) {
				await sessionRepository.deleteById(session.id);
			}

			return ok(null);
		});

	// ── Logout all devices ───────────────────────────────────────────────────────
	const logoutAll: AuthService["logoutAll"] = (userId) =>
		run("logoutAll", async () => {
			await sessionRepository.deleteAllByUserId(userId);

			return ok(null);
		});

	// ── Verify access token (used by middleware) ─────────────────────────────────
	const verifyAccessToken: AuthService["verifyAccessToken"] = (token) =>
		tokenService.verifyAccessToken(token);

	return { login, refresh, logout, logoutAll, verifyAccessToken };
};

export type { AuthService };
