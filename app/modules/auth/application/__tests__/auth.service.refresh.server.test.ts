import { describe, expect, test } from "vitest";
import { createMemorySingleFlight } from "@/shared/concurrency/single-flight.memory";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type { AuthConfig } from "../../domain/auth.config";
import {
	InvalidSessionError,
	PlatformLockedError,
	SessionExpiredError,
	TokenReuseError,
} from "../../domain/auth.errors";
import type { Session } from "../../domain/auth.types";
import type { SecuritySnapshot } from "../../domain/security-state.repository";
import type { RotateOutcome } from "../../domain/session.repository";
import { createAuthService } from "../auth.service.server";

const SESSION_ID = "8f1a2b3c-0000-4000-8000-000000000001";
const RAW_TOKEN = "token-crudo";
/** El servicio hashea antes de buscar; el doble usa el mismo prefijo trivial. */
const hashOf = (raw: string) => `sha256:${raw}`;
const CURRENT_HASH = hashOf(RAW_TOKEN);

const GRACE_S = 60;

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const snapshotOf = (
	overrides: Partial<SecuritySnapshot> = {},
): SecuritySnapshot => ({
	tokensValidAfter: new Date(0),
	lockdownAt: null,
	lockdownScope: null,
	lockdownReason: null,
	lockdownBy: null,
	userTokensValidAfter: new Map(),
	readAt: new Date(),
	...overrides,
});

const sessionOf = (overrides: Partial<Session> = {}): Session =>
	({
		id: SESSION_ID,
		userId: 7,
		refreshTokenHash: CURRENT_HASH,
		prevTokenHash: null,
		rotatedAt: null,
		userAgent: null,
		ipAddress: null,
		expiresAt: new Date(Date.now() + 86_400_000),
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}) as Session;

/**
 * Dobles mínimos: solo lo que toca `refresh`. El resto del cradle se deja fuera a
 * propósito — un doble completo escondería qué depende realmente de qué.
 */
const createHarness = (
	options: {
		session?: Session | null;
		user?: {
			id: number;
			documentId: string;
			email: string;
			role: string;
			dependencyId: number | null;
			isTrainer?: boolean;
			archivedAt?: Date | null;
		} | null;
		rotateOutcomes?: RotateOutcome[];
		snapshot?: SecuritySnapshot;
	} = {},
) => {
	const calls = {
		findByTokenHash: [] as string[],
		deleteById: [] as string[],
		deleteAllByUserId: [] as number[],
		rotate: [] as { expectedTokenHash: string }[],
		signed: 0,
	};

	const outcomes = [...(options.rotateOutcomes ?? ["rotated"])];

	const sessionRepository = {
		findByTokenHash: async (hash: string) => {
			calls.findByTokenHash.push(hash);
			// Por defecto devuelve una sesión cuyo token VIGENTE es el consultado —
			// que es lo que hace la consulta real. Los casos de gracia y de reuso
			// pasan su propia sesión con `prevTokenHash`.
			return options.session === undefined
				? sessionOf({ refreshTokenHash: hash })
				: options.session;
		},
		rotateIfCurrent: async (params: { expectedTokenHash: string }) => {
			calls.rotate.push({ expectedTokenHash: params.expectedTokenHash });
			return (outcomes.shift() ?? "rotated") as RotateOutcome;
		},
		deleteById: async (id: string) => {
			calls.deleteById.push(id);
		},
		deleteAllByUserId: async (userId: number) => {
			calls.deleteAllByUserId.push(userId);
		},
	} as unknown as ICradle["sessionRepository"];

	const userRepository = {
		findByInternalId: async () =>
			options.user === undefined
				? {
						id: 7,
						documentId: "11111111-1111-4111-8111-111111111111",
						email: "ana@empresa.com",
						role: "USER",
						dependencyId: 3,
						isTrainer: false,
						archivedAt: null,
					}
				: options.user,
	} as unknown as ICradle["userRepository"];

	const tokenService = {
		hashRefreshToken: hashOf,
		generateRefreshToken: () => "token-nuevo",
		signAccessToken: async () => {
			calls.signed += 1;
			return "access-nuevo";
		},
		// El servicio solo delega; el doble devuelve null para no acoplar este
		// archivo a la implementación real de jose (que ya tiene su propio test).
		verifyAccessToken: async () => null,
		getRefreshTokenExpiry: () => new Date(Date.now() + 86_400_000),
	} as unknown as ICradle["tokenService"];

	const securityStateRepository = {
		get: async () => options.snapshot ?? snapshotOf(),
	} as unknown as ICradle["securityStateRepository"];

	const service = createAuthService({
		sessionRepository,
		userRepository,
		tokenService,
		passwordService: {} as unknown as ICradle["passwordService"],
		singleFlight: createMemorySingleFlight(),
		rateLimiter: {} as unknown as ICradle["rateLimiter"],
		logger: silentLogger,
		authConfig: { refreshGraceS: GRACE_S } as AuthConfig,
		securityStateRepository,
	});

	return { service, calls };
};

describe("createAuthService — normal rotation", () => {
	test("issues a brand new token pair", async () => {
		const { service } = createHarness();

		const result = await service.refresh(RAW_TOKEN);

		expect(result).toEqual({
			accessToken: "access-nuevo",
			refreshToken: "token-nuevo",
		});
	});

	// El hash del token entrante es la clave de la búsqueda: el token CRUDO nunca
	// llega al repositorio, porque en la base solo hay hashes.
	test("looks the session up by hash, never by the raw token", async () => {
		const { service, calls } = createHarness();

		await service.refresh(RAW_TOKEN);

		expect(calls.findByTokenHash).toEqual([CURRENT_HASH]);
		expect(calls.findByTokenHash[0]).not.toContain(`${RAW_TOKEN.slice(0, 5)}!`);
	});

	// Compare-and-swap: se rota solo si el hash esperado sigue siendo el vigente.
	// Es la capa 2, la que resuelve la carrera ENTRE procesos.
	test("rotates with a compare-and-swap on the expected hash", async () => {
		const { service, calls } = createHarness();

		await service.refresh(RAW_TOKEN);

		expect(calls.rotate).toEqual([{ expectedTokenHash: CURRENT_HASH }]);
	});

	test("an unknown hash is an invalid session", async () => {
		const { service } = createHarness({ session: null });

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			InvalidSessionError,
		);
	});

	// Una sesión caducada se borra al detectarla: dejarla acumularía filas muertas
	// que ya no autentican.
	test("an expired session is deleted and rejected", async () => {
		const { service, calls } = createHarness({
			session: sessionOf({ expiresAt: new Date(Date.now() - 1000) }),
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			SessionExpiredError,
		);
		expect(calls.deleteById).toEqual([SESSION_ID]);
	});

	// El usuario pudo borrarse con la sesión aún viva: la sesión se limpia y el
	// refresh falla, en vez de acuñar un token para una cuenta que ya no existe.
	test("a vanished user deletes the session and rejects", async () => {
		const { service, calls } = createHarness({ user: null });

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			InvalidSessionError,
		);
		expect(calls.deleteById).toEqual([SESSION_ID]);
	});

	// El access token se acuña con datos FRESCOS del usuario: si le cambiaron el
	// rol, el token nuevo lo refleja sin esperar a que cierre sesión.
	test("mints the access token from freshly read user data", async () => {
		const { service, calls } = createHarness({
			user: {
				id: 7,
				documentId: "11111111-1111-4111-8111-111111111111",
				email: "ana@empresa.com",
				role: "ADMIN",
				dependencyId: null,
				isTrainer: false,
			},
		});

		await service.refresh(RAW_TOKEN);

		expect(calls.signed).toBe(1);
	});
});

describe("createAuthService — stale rotation", () => {
	// "stale" ⇒ otro proceso rotó entre la lectura y el update. Se re-evalúa UNA
	// vez: el hash entrante debería caer ahora en la rama de gracia.
	test("retries exactly once when the swap comes back stale", async () => {
		const { service, calls } = createHarness({
			rotateOutcomes: ["stale", "rotated"],
		});

		const result = await service.refresh(RAW_TOKEN);

		expect(calls.rotate).toHaveLength(2);
		expect(result.refreshToken).toBe("token-nuevo");
	});

	// Y solo una: un bucle de reintentos ante un "stale" persistente sería una
	// tormenta de escrituras contra la misma fila.
	test("gives up after the second stale instead of looping", async () => {
		const { service, calls } = createHarness({
			rotateOutcomes: ["stale", "stale"],
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			InvalidSessionError,
		);
		expect(calls.rotate).toHaveLength(2);
	});
});

describe("createAuthService — grace window", () => {
	const graceSession = (rotatedMsAgo: number) =>
		sessionOf({
			refreshTokenHash: hashOf("token-ya-rotado"),
			prevTokenHash: CURRENT_HASH,
			rotatedAt: new Date(Date.now() - rotatedMsAgo),
		});

	// Cliente rezagado: llega con el token ya rotado dentro de la ventana. No se
	// rota otra vez ni se puede reemitir el refresh vigente (en la base solo hay
	// hashes), así que se devuelve SOLO el access token.
	test("a late client inside the window gets a new access token and NO refresh", async () => {
		const { service, calls } = createHarness({ session: graceSession(1000) });

		const result = await service.refresh(RAW_TOKEN);

		expect(result).toEqual({
			accessToken: "access-nuevo",
			refreshToken: null,
		});
		expect(calls.rotate).toEqual([]);
	});

	test("does not revoke anything on a grace hit", async () => {
		const { service, calls } = createHarness({ session: graceSession(1000) });

		await service.refresh(RAW_TOKEN);

		expect(calls.deleteAllByUserId).toEqual([]);
		expect(calls.deleteById).toEqual([]);
	});

	test("an expired session is rejected even inside the grace window", async () => {
		const { service } = createHarness({
			session: sessionOf({
				refreshTokenHash: hashOf("token-ya-rotado"),
				prevTokenHash: CURRENT_HASH,
				rotatedAt: new Date(Date.now() - 1000),
				expiresAt: new Date(Date.now() - 1000),
			}),
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			SessionExpiredError,
		);
	});

	// Sin `rotatedAt` no hay ventana que medir: se trata como reuso, que es el
	// lado seguro del error.
	test("a session that never rotated cannot be inside the window", async () => {
		const { service, calls } = createHarness({
			session: sessionOf({
				refreshTokenHash: hashOf("otro"),
				prevTokenHash: CURRENT_HASH,
				rotatedAt: null,
			}),
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			TokenReuseError,
		);
		expect(calls.deleteAllByUserId).toEqual([7]);
	});
});

describe("createAuthService — token reuse", () => {
	// Reuso FUERA de la gracia ⇒ robo presunto. OAuth 2.1: se revoca la familia
	// completa de sesiones del usuario, no solo la implicada — si el token se
	// filtró, no se sabe qué más se filtró con él.
	test("revokes EVERY session of the user and rejects", async () => {
		const { service, calls } = createHarness({
			session: sessionOf({
				refreshTokenHash: hashOf("token-ya-rotado"),
				prevTokenHash: CURRENT_HASH,
				rotatedAt: new Date(Date.now() - (GRACE_S + 10) * 1000),
			}),
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			TokenReuseError,
		);
		expect(calls.deleteAllByUserId).toEqual([7]);
	});

	test("does not mint any token on a reuse", async () => {
		const { service, calls } = createHarness({
			session: sessionOf({
				refreshTokenHash: hashOf("token-ya-rotado"),
				prevTokenHash: CURRENT_HASH,
				rotatedAt: new Date(Date.now() - (GRACE_S + 10) * 1000),
			}),
		});

		await service.refresh(RAW_TOKEN).catch(() => {});

		expect(calls.signed).toBe(0);
	});
});

describe("createAuthService — single flight", () => {
	// Capa 1 de la rotación: N peticiones concurrentes con el MISMO token
	// comparten una sola rotación y reciben el mismo par. Sin esto, dos pestañas
	// refrescando a la vez se invalidarían mutuamente.
	test("concurrent refreshes of the same token share ONE rotation", async () => {
		const { service, calls } = createHarness();

		const results = await Promise.all([
			service.refresh(RAW_TOKEN),
			service.refresh(RAW_TOKEN),
			service.refresh(RAW_TOKEN),
		]);

		expect(calls.rotate).toHaveLength(1);
		expect(results[1]).toEqual(results[0]);
		expect(results[2]).toEqual(results[0]);
	});

	test("different tokens do not share a rotation", async () => {
		const { service, calls } = createHarness();

		await Promise.all([
			service.refresh(RAW_TOKEN),
			service.refresh("otro-token"),
		]);

		expect(calls.rotate).toHaveLength(2);
	});
});

describe("createAuthService — lockdown except-admin during refresh", () => {
	const exceptAdmin = snapshotOf({
		lockdownAt: new Date(),
		lockdownScope: "except-admin",
	});

	const userWith = (role: string) => ({
		id: 7,
		documentId: "11111111-1111-4111-8111-111111111111",
		email: "ana@empresa.com",
		role,
		dependencyId: 3,
		isTrainer: false,
	});

	// El alcance `all` corta al principio de `refresh`, antes del single-flight.
	// `except-admin` no puede saberse allí (no hay rol todavía) y se corta DENTRO
	// de rotate, en las dos ramas que resuelven el usuario.
	test("blocks a USER on the normal rotation branch", async () => {
		const { service } = createHarness({
			snapshot: exceptAdmin,
			user: userWith("USER"),
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			PlatformLockedError,
		);
	});

	test("lets an ADMIN rotate normally", async () => {
		const { service } = createHarness({
			snapshot: exceptAdmin,
			user: userWith("ADMIN"),
		});

		const result = await service.refresh(RAW_TOKEN);

		expect(result.refreshToken).toBe("token-nuevo");
	});

	// La segunda rama que resuelve usuario: el hit de gracia. Sin el corte aquí,
	// un cliente rezagado seguiría recibiendo access tokens durante el cierre.
	test("blocks a USER on the grace branch too", async () => {
		const { service } = createHarness({
			snapshot: exceptAdmin,
			user: userWith("USER"),
			session: sessionOf({
				refreshTokenHash: hashOf("token-ya-rotado"),
				prevTokenHash: CURRENT_HASH,
				rotatedAt: new Date(Date.now() - 1000),
			}),
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			PlatformLockedError,
		);
	});

	test("lets an ADMIN through the grace branch", async () => {
		const { service } = createHarness({
			snapshot: exceptAdmin,
			user: userWith("ADMIN"),
			session: sessionOf({
				refreshTokenHash: hashOf("token-ya-rotado"),
				prevTokenHash: CURRENT_HASH,
				rotatedAt: new Date(Date.now() - 1000),
			}),
		});

		const result = await service.refresh(RAW_TOKEN);

		expect(result.refreshToken).toBeNull();
	});
});

describe("createAuthService — verifyAccessToken", () => {
	// Delega en el tokenService sin envolver en el envelope: lo consume el
	// middleware, que necesita distinguir "no vale" de una respuesta de negocio.
	test("delegates straight to the token service", async () => {
		const { service } = createHarness();

		expect(await service.verifyAccessToken("cualquier-token")).toBeNull();
	});
});

describe("createAuthService — cuenta archivada durante el refresh", () => {
	const archivedUser = {
		id: 7,
		documentId: "11111111-1111-4111-8111-111111111111",
		email: "ana@empresa.com",
		role: "USER",
		dependencyId: 3,
		isTrainer: false,
		archivedAt: new Date(),
	};

	const graceSession = () =>
		sessionOf({
			refreshTokenHash: hashOf("token-ya-rotado"),
			prevTokenHash: CURRENT_HASH,
			rotatedAt: new Date(Date.now() - 1000),
		});

	// Archivar sube el epoch, pero eso solo mata el access token EN CURSO: sin
	// esta comprobación el refresh emitiría uno nuevo cada vez y la cuenta
	// desactivada no perdería el acceso nunca.
	test("la rama de rotación normal rechaza una cuenta archivada", async () => {
		const { service } = createHarness({ user: archivedUser });

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			InvalidSessionError,
		);
	});

	// Se borran TODAS sus sesiones: dejar una viva sería dejarle otro intento.
	test("borra todas las sesiones de la cuenta archivada", async () => {
		const { service, calls } = createHarness({ user: archivedUser });

		await service.refresh(RAW_TOKEN).catch(() => {});

		expect(calls.deleteAllByUserId).toEqual([7]);
	});

	test("no emite access token para una cuenta archivada", async () => {
		const { service, calls } = createHarness({ user: archivedUser });

		await service.refresh(RAW_TOKEN).catch(() => {});

		expect(calls.signed).toBe(0);
	});

	// La ventana de gracia es el OTRO camino que emite access tokens: cerrar solo
	// la rotación normal no cerraría nada.
	test("la rama de gracia también la rechaza", async () => {
		const { service } = createHarness({
			session: graceSession(),
			user: archivedUser,
		});

		await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(
			InvalidSessionError,
		);
	});

	test("la rama de gracia también borra sus sesiones", async () => {
		const { service, calls } = createHarness({
			session: graceSession(),
			user: archivedUser,
		});

		await service.refresh(RAW_TOKEN).catch(() => {});

		expect(calls.deleteAllByUserId).toEqual([7]);
		expect(calls.signed).toBe(0);
	});

	// La cuenta activa sigue rotando con normalidad: la comprobación no puede
	// convertirse en un corte para todo el mundo.
	test("una cuenta activa no se ve afectada", async () => {
		const { service, calls } = createHarness();

		const result = await service.refresh(RAW_TOKEN);

		expect(result.accessToken).toBe("access-nuevo");
		expect(calls.deleteAllByUserId).toEqual([]);
	});
});
