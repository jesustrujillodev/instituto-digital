import {
	asFunction,
	asValue,
	createContainer,
	InjectionMode,
	Lifetime,
} from "awilix";
import {
	clearAuthCookies,
	parseTokenCookies,
	serializeAuthCookies,
} from "@/core/cookies.server";
import { env } from "@/core/env.server";
import { createAuthService } from "@/modules/auth/application/auth.service.server";
import { createPasswordService } from "@/modules/auth/application/password.service.server";
import { createSecurityStateService } from "@/modules/auth/application/security-state.service.server";
import { createSessionMonitorService } from "@/modules/auth/application/session-monitor.service.server";
import { createTokenService } from "@/modules/auth/application/token.service.server";
import type { AuthConfig } from "@/modules/auth/domain/auth.config";
import { AuthError } from "@/modules/auth/domain/auth.errors";
import type { VerifiedAccessTokenPayload } from "@/modules/auth/domain/auth.types";
import { evaluateToken } from "@/modules/auth/domain/security-state.rules";
import { createCachedSecurityStateRepository } from "@/modules/auth/infrastructure/security-state.cache.server";
import { createSecurityStateRepository } from "@/modules/auth/infrastructure/security-state.repository.server";
import { createSessionRepository } from "@/modules/auth/infrastructure/session.repository.server";
import { createCalendarService } from "@/modules/calendar/application/calendar.service.server";
import { createCalendarRepository } from "@/modules/calendar/infrastructure/calendar.repository.server";
import { createCloudService } from "@/modules/cloud/application/cloud.service.server";
import { createCourseService } from "@/modules/courses/application/courses.service.server";
import { createCourseRepository } from "@/modules/courses/infrastructure/courses.repository.server";
import { createCreditService } from "@/modules/credits/application/credits.service.server";
import { createCreditRepository } from "@/modules/credits/infrastructure/credits.repository.server";
import { createDependencyService } from "@/modules/dependencies/application/dependencies.service.server";
import { createDependencyRepository } from "@/modules/dependencies/infrastructure/dependencies.repository.server";
import { createEnrollmentService } from "@/modules/enrollments/application/enrollments.service.server";
import { createEnrollmentRepository } from "@/modules/enrollments/infrastructure/enrollments.repository.server";
import { createGroupService } from "@/modules/groups/application/groups.service.server";
import { createGroupRepository } from "@/modules/groups/infrastructure/groups.repository.server";
import { createRatingService } from "@/modules/ratings/application/ratings.service.server";
import { createRatingRepository } from "@/modules/ratings/infrastructure/ratings.repository.server";
import { createTeachingService } from "@/modules/teaching/application/teaching.service.server";
import { createTeachingRepository } from "@/modules/teaching/infrastructure/teaching.repository.server";
import { createThemeService } from "@/modules/theme/application/theme.service.server";
import {
	THEME_CACHE_RETRY_S,
	THEME_CACHE_TTL_S,
} from "@/modules/theme/domain/theme.config";
import { createCachedThemeRepository } from "@/modules/theme/infrastructure/theme.cache.server";
import { createThemeRepository } from "@/modules/theme/infrastructure/theme.repository.server";
import { createFileThemeSnapshot } from "@/modules/theme/infrastructure/theme.snapshot.server";
import { createTrainerService } from "@/modules/trainers/application/trainers.service.server";
import { createTrainerRepository } from "@/modules/trainers/infrastructure/trainers.repository.server";
import { createUserService } from "@/modules/users/application/users.service.server";
import { createUserPhotoReferenceSource } from "@/modules/users/infrastructure/user-photo.references.server";
import { createUserRepository } from "@/modules/users/infrastructure/users.repository.server";
import { createMemorySingleFlight } from "@/shared/concurrency/single-flight.memory";
import { createConsoleLogger } from "@/shared/logging/logger.console";
import { createMemoryRateLimiter } from "@/shared/rate-limit/rate-limiter.memory";
import { createAssetUrlResolver } from "@/shared/storage/public-url";
import { createStorageProviderFromEnv } from "@/shared/storage/storage.factory";
import { systemClock } from "@/shared/time/clock";
import prisma, { runInTransaction } from "../../core/db.server";
import type { ApiContext } from "../types";
import type { ICradle } from "./container.types";

// ── Singletons de PROCESO ──────────────────────────────────────────────────────
// Viven entre peticiones. El single-flight y el rate limiter serían inútiles
// como instancias por petición; el logger no necesita estado por petición.
const authConfig: AuthConfig = {
	jwtSecret: env.JWT_SECRET,
	accessTokenTtlS: env.AUTH_ACCESS_TOKEN_TTL_S,
	refreshTokenTtlS: env.AUTH_REFRESH_TOKEN_TTL_S,
	refreshGraceS: env.AUTH_REFRESH_GRACE_S,
	issuer: env.AUTH_JWT_ISSUER,
	audience: env.AUTH_JWT_AUDIENCE,
	loginMaxPerEmail: env.AUTH_LOGIN_MAX_PER_EMAIL,
	loginMaxPerIp: env.AUTH_LOGIN_MAX_PER_IP,
	loginWindowS: env.AUTH_LOGIN_WINDOW_S,
	maxSessionsPerUser: env.AUTH_MAX_SESSIONS_PER_USER,
	securityStateCacheTtlS: env.AUTH_SECURITY_STATE_CACHE_TTL_S,
};

const singleFlight = createMemorySingleFlight();
const rateLimiter = createMemoryRateLimiter();
const logger = createConsoleLogger({
	level: env.NODE_ENV === "production" ? "info" : "debug",
});
// El provider cierra sobre el cliente del SDK (S3Client/Storage): se construye
// UNA sola vez a nivel de módulo y se comparte entre peticiones. Registrarlo con
// asFunction lo recrearía en cada request (el contenedor es por-petición).
const storageProvider = createStorageProviderFromEnv(env, logger);
// Puro y sin estado, pero se construye una vez por la misma razón: es una
// clausura sobre el dominio público, no algo que dependa de la petición.
const assetUrlResolver = createAssetUrlResolver(env.STORAGE_PUBLIC_DOMAIN);

// El estado de seguridad se consulta en CADA petición autenticada, así que la
// caché tiene que vivir entre peticiones: registrarlo con `asSingleton` daría
// una instancia por request y no cachearía nada. Va aquí, con asValue.
const securityState = createCachedSecurityStateRepository({
	inner: createSecurityStateRepository({ prisma, authConfig }),
	ttlMs: authConfig.securityStateCacheTtlS * 1000,
	logger,
});

// El tema activo se lee en CADA petición —también en la landing y el login— y
// cambia cuando un admin pulsa "activar", o sea casi nunca. Mismo motivo y misma
// advertencia que arriba: con `asSingleton` la caché sería por request y no
// cachearía nada.
//
// El snapshot en disco es lo que mantiene el tema activo cuando un proceso
// arranca con la base caída (docs/theme/01-theme-builder.md §4.1).
const themeRepository = createCachedThemeRepository({
	inner: createThemeRepository({ prisma, logger }),
	ttlMs: THEME_CACHE_TTL_S * 1000,
	retryMs: THEME_CACHE_RETRY_S * 1000,
	snapshot: createFileThemeSnapshot({
		path: env.THEME_SNAPSHOT_PATH,
		logger,
	}),
	logger,
});

/**
 * ¿El token sigue vivo según la política de revocación?
 *
 * La decisión es de dominio (`evaluateToken`); aquí solo se resuelve el estado
 * y se traduce el fallo de lectura.
 */
const isStillValid = async (payload: VerifiedAccessTokenPayload) => {
	try {
		const verdict = evaluateToken(payload, await securityState.get());
		if (!verdict.allowed) {
			logger.info("token revoked by epoch", {
				reason: verdict.reason,
				userId: payload.userId,
			});
		}
		return verdict.allowed;
	} catch (err) {
		// Estado indisponible en frío ⇒ DENEGAR (docs/auth/01 §8.2). Cae en la
		// rama de refresh que YA existe: si la base está caída, también fallará y
		// el usuario acabará en login con las cookies limpias. Nunca se abre la
		// plataforma por un error de lectura.
		logger.error("security state unavailable — denying access", {
			message: err instanceof Error ? err.message : String(err),
		});
		return false;
	}
};

// ── configureContainer ─────────────────────────────────────────────────────────
// Creates a fresh Awilix container per request and runs silent token-refresh:
//   1. Valid access token → return immediately, nothing to refresh
//   2. Missing/expired access token → try refresh token:
//      a. Success → apiContext.newCookies set (middleware appends Set-Cookie)
//      b. Failure → apiContext.shouldRedirectToLogin set (middleware redirects)
export const configureContainer = async (
	request: Request,
	apiContext: ApiContext,
) => {
	const freshContainer = createContainer<ICradle>({
		injectionMode: InjectionMode.PROXY,
	});

	const asSingleton = <T>(fn: Parameters<typeof asFunction<T>>[0]) =>
		asFunction(fn, { lifetime: Lifetime.SINGLETON });

	freshContainer.register({
		prisma: asValue(prisma),
		runInTransaction: asValue(runInTransaction),
		clock: asValue(systemClock),
		authConfig: asValue(authConfig),
		env: asValue(env),
		storageBucket: asValue(env.STORAGE_BUCKET_NAME ?? null),
		storagePublicBucket: asValue(env.STORAGE_PUBLIC_BUCKET_NAME ?? null),
		assetUrlResolver: asValue(assetUrlResolver),
		singleFlight: asValue(singleFlight),
		rateLimiter: asValue(rateLimiter),
		logger: asValue(logger),
		storageProvider: asValue(storageProvider),
		securityStateRepository: asValue(securityState),
		tokenService: asSingleton(createTokenService),
		passwordService: asSingleton(createPasswordService),
		sessionRepository: asSingleton(createSessionRepository),
		authService: asSingleton(createAuthService), // ya recibe securityStateRepository vía PROXY
		sessionMonitorService: asSingleton(createSessionMonitorService),
		securityStateService: asSingleton(createSecurityStateService),
		userRepository: asSingleton(createUserRepository),
		userService: asSingleton(createUserService),
		dependencyRepository: asSingleton(createDependencyRepository),
		dependencyService: asSingleton(createDependencyService),
		trainerRepository: asSingleton(createTrainerRepository),
		trainerService: asSingleton(createTrainerService),
		groupRepository: asSingleton(createGroupRepository),
		groupService: asSingleton(createGroupService),
		courseRepository: asSingleton(createCourseRepository),
		courseService: asSingleton(createCourseService),
		enrollmentRepository: asSingleton(createEnrollmentRepository),
		enrollmentService: asSingleton(createEnrollmentService),
		calendarRepository: asSingleton(createCalendarRepository),
		calendarService: asSingleton(createCalendarService),
		teachingRepository: asSingleton(createTeachingRepository),
		teachingService: asSingleton(createTeachingService),
		creditRepository: asSingleton(createCreditRepository),
		creditService: asSingleton(createCreditService),
		ratingRepository: asSingleton(createRatingRepository),
		ratingService: asSingleton(createRatingService),
		// Una fuente por módulo que guarda keys de storage. Añadir un módulo con
		// archivos = añadir su fuente aquí; el gestor de nube no cambia.
		objectReferenceSources: asSingleton((cradle: ICradle) => [
			createUserPhotoReferenceSource(cradle),
		]),
		cloudService: asSingleton((cradle: ICradle) => createCloudService(cradle)),
		themeRepository: asValue(themeRepository),
		themeService: asSingleton(createThemeService),
	});

	const cookieHeader = request.headers.get("Cookie");
	const { accessToken, refreshToken } = await parseTokenCookies(cookieHeader);
	const authService = freshContainer.resolve("authService");

	let authPayload: ICradle["authPayload"] = null;

	if (accessToken) {
		authPayload = await authService.verifyAccessToken(accessToken);
		// Firma válida no basta: el token también tiene que ser posterior al epoch
		// de validez. Es lo que hace que revocar corte el acceso EN CURSO y no solo
		// la renovación (docs/auth/02-revocacion-inmediata-epoch.md).
		if (authPayload && (await isStillValid(authPayload))) {
			freshContainer.register({ authPayload: asValue(authPayload) });
			return freshContainer;
		}
		authPayload = null;
		logger.debug("access token rejected — attempting silent refresh");
	}

	if (refreshToken) {
		try {
			const { accessToken: newAccess, refreshToken: newRefresh } =
				await authService.refresh(refreshToken);
			// newRefresh null ⇒ hit de gracia: solo se reemite la cookie de access.
			apiContext.newCookies = await serializeAuthCookies({
				accessToken: newAccess,
				refreshToken: newRefresh,
			});
			// Verify the freshly issued token to get the payload for this request
			authPayload = await authService.verifyAccessToken(newAccess);
			logger.debug("token refreshed", { rotated: newRefresh !== null });
		} catch (err) {
			// Catch-all deliberado: también los errores de infraestructura (DB
			// caída, timeout de Prisma) degradan a "redirect a login", nunca a un
			// crash sin controlar. Los inesperados se loguean a nivel error.
			if (err instanceof AuthError) {
				logger.info("refresh failed — redirecting to login", {
					code: err.code,
				});
			} else {
				logger.error("unexpected error during refresh — redirecting to login", {
					message: err instanceof Error ? err.message : String(err),
				});
			}
			apiContext.shouldRedirectToLogin = true;
			apiContext.newCookies = await clearAuthCookies();
		}
	}

	// Always register authPayload (null for anonymous/failed requests)
	freshContainer.register({ authPayload: asValue(authPayload) });
	return freshContainer;
};
