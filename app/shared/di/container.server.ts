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
import { env, isEmailWorkerEnabled } from "@/core/env.server";
import { createAnnualPlanService } from "@/modules/annual-plan/application/annual-plan.service.server";
import { createAnnualPlanRepository } from "@/modules/annual-plan/infrastructure/annual-plan.repository.server";
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
import { createCertificateIssuance } from "@/modules/certificates/application/certificate-issuance.server";
import { createCertificateLogoService } from "@/modules/certificates/application/certificate-logos.service.server";
import { createCertificateTemplateService } from "@/modules/certificates/application/certificate-templates.service.server";
import { createCertificateService } from "@/modules/certificates/application/certificates.service.server";
import { createCertificateAssetReferenceSource } from "@/modules/certificates/infrastructure/certificate-assets.references.server";
import { createCertificateAssetSource } from "@/modules/certificates/infrastructure/certificate-assets.server";
import { createCertificateLogoReferenceSource } from "@/modules/certificates/infrastructure/certificate-logo.references.server";
import { createCertificateLogoRepository } from "@/modules/certificates/infrastructure/certificate-logos.repository.server";
import { createCertificateTemplateReferenceSource } from "@/modules/certificates/infrastructure/certificate-template.references.server";
import { createCertificateTemplateRepository } from "@/modules/certificates/infrastructure/certificate-templates.repository.server";
import { createCertificateRepository } from "@/modules/certificates/infrastructure/certificates.repository.server";
import { createChromiumExporter } from "@/modules/certificates/infrastructure/chromium-exporter.server";
import { createPdfLibTools } from "@/modules/certificates/infrastructure/pdf-lib-tools.server";
import { createCheckInService } from "@/modules/check-in/application/check-in.service.server";
import { createCloudService } from "@/modules/cloud/application/cloud.service.server";
import { createClassroomService } from "@/modules/content/application/classroom.service.server";
import { createContentService } from "@/modules/content/application/content.service.server";
import { createLessonMaterialReader } from "@/modules/content/application/lesson-material.reader.server";
import { createProgressSync } from "@/modules/content/application/progress-sync.server";
import { createQuizService } from "@/modules/content/application/quiz.service.server";
import { createSessionMaterialService } from "@/modules/content/application/session-material.service.server";
import { createClassroomRepository } from "@/modules/content/infrastructure/classroom.repository.server";
import { createContentRepository } from "@/modules/content/infrastructure/content.repository.server";
import { createLessonMaterialReferenceSource } from "@/modules/content/infrastructure/lesson-material.references.server";
import { createQuizRepository } from "@/modules/content/infrastructure/quiz.repository.server";
import { createSessionMaterialReferenceSource } from "@/modules/content/infrastructure/session-material.references.server";
import { createSessionMaterialRepository } from "@/modules/content/infrastructure/session-material.repository.server";
import { createCourseService } from "@/modules/courses/application/courses.service.server";
import { createCourseCoverReferenceSource } from "@/modules/courses/infrastructure/course-cover.references.server";
import { createCourseRepository } from "@/modules/courses/infrastructure/courses.repository.server";
import { createCreditService } from "@/modules/credits/application/credits.service.server";
import { createCachedCreditRepository } from "@/modules/credits/infrastructure/credits.repository.cache.server";
import { createCreditRepository } from "@/modules/credits/infrastructure/credits.repository.server";
import { createDependencyService } from "@/modules/dependencies/application/dependencies.service.server";
import { createDependencyRepositoryWithInvalidation } from "@/modules/dependencies/infrastructure/dependencies.repository.cache.server";
import { createDependencyRepository } from "@/modules/dependencies/infrastructure/dependencies.repository.server";
import { createEnrollmentQrService } from "@/modules/enrollment-qr/application/enrollment-qr.service.server";
import { createEnrollmentService } from "@/modules/enrollments/application/enrollments.service.server";
import { createEnrollmentRepository } from "@/modules/enrollments/infrastructure/enrollments.repository.server";
import { createGroupService } from "@/modules/groups/application/groups.service.server";
import { createGroupRepository } from "@/modules/groups/infrastructure/groups.repository.server";
import {
	drainOutbox,
	startEmailOutboxWorker,
} from "@/modules/notifications/application/email-outbox.worker.server";
import { createNotificationService } from "@/modules/notifications/application/notifications.service.server";
import { createNotificationRepository } from "@/modules/notifications/infrastructure/notifications.repository.server";
import { createRatingService } from "@/modules/ratings/application/ratings.service.server";
import { createRatingRepository } from "@/modules/ratings/infrastructure/ratings.repository.server";
import { createCompletionSync } from "@/modules/teaching/application/completion-sync.server";
import { createTeachingService } from "@/modules/teaching/application/teaching.service.server";
import { createTeachingRepository } from "@/modules/teaching/infrastructure/teaching.repository.server";
import { createThemeService } from "@/modules/theme/application/theme.service.server";
import { createThemeRepository } from "@/modules/theme/infrastructure/theme.repository.server";
import { createTrainerService } from "@/modules/trainers/application/trainers.service.server";
import { createTrainerRepository } from "@/modules/trainers/infrastructure/trainers.repository.server";
import { createUserService } from "@/modules/users/application/users.service.server";
import { createUserPhotoReferenceSource } from "@/modules/users/infrastructure/user-photo.references.server";
import { createUserRepository } from "@/modules/users/infrastructure/users.repository.server";
import { createInvalidationBus } from "@/shared/cache/invalidation-bus.factory.server";
import { createVersionedCache } from "@/shared/cache/versioned-cache.factory.server";
import { createMemorySingleFlight } from "@/shared/concurrency/single-flight.memory";
import { createConsoleLogger } from "@/shared/logging/logger.console";
import { createThrottledLog } from "@/shared/logging/throttled-log";
import { createMailerFromEnv } from "@/shared/mail/mailer.factory.server";
import { createJobDispatcher } from "@/shared/queue/job-dispatcher.factory.server";
import { createJobFailureRepository } from "@/shared/queue/job-failure.repository.server";
import { createQueueClientFromEnv } from "@/shared/queue/queue.client.server";
import { createRateLimiter } from "@/shared/rate-limit/rate-limiter.factory.server";
import { createRedisConnectionsFromEnv } from "@/shared/redis/redis.client.server";
import { REDIS_ERROR_LOG_INTERVAL_MS } from "@/shared/redis/redis.config";
import { createExcelSpreadsheetWriter } from "@/shared/spreadsheet/exceljs.spreadsheet-writer.server";
import { createAssetUrlResolver } from "@/shared/storage/public-url";
import { createStorageProviderFromEnv } from "@/shared/storage/storage.factory";
import { createUrlSignerFromEnv } from "@/shared/storage/url-signer.factory.server";
import { systemClock } from "@/shared/time/clock";
import prisma, { afterCommit, runInTransaction } from "../../core/db.server";
import type { ApiContext } from "../types";
import type { ICradle } from "./container.types";
import { createJobHandlers } from "./job-handlers.server";

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
const logger = createConsoleLogger({
	level: env.NODE_ENV === "production" ? "info" : "debug",
});
// Opcional (docs/redis/00-redis.md): sin REDIS_URL es `null` y cada pieza usa su
// adaptador de proceso. Las conexiones no van al cradle: nadie fuera de la
// composición habla con Redis directamente.
const redis = createRedisConnectionsFromEnv(env, logger);
// Las colas usan el mismo Redis con conexiones propias (docs/queues/00-colas.md).
const queueClient = createQueueClientFromEnv(env, logger);
const queueLog = createThrottledLog(logger, {
	intervalMs: REDIS_ERROR_LOG_INTERVAL_MS,
});
const rateLimiter = createRateLimiter({
	redis: redis?.command ?? null,
	logger,
});
const aggregateCache = createVersionedCache({
	redis: redis?.command ?? null,
	logger,
});
// El provider cierra sobre el cliente del SDK (S3Client/Storage): se construye
// UNA sola vez a nivel de módulo y se comparte entre peticiones. Registrarlo con
// asFunction lo recrearía en cada request (el contenedor es por-petición).
const storageProvider = createStorageProviderFromEnv(env, logger);
const urlSigner = createUrlSignerFromEnv({
	redis: redis?.command ?? null,
	storageProvider,
	logger,
});
// Puro y sin estado, pero se construye una vez por la misma razón: es una
// clausura sobre el dominio público, no algo que dependa de la petición.
const assetUrlResolver = createAssetUrlResolver(env.STORAGE_PUBLIC_DOMAIN);

// El mailer cierra sobre el transporte SMTP (y su pool de conexiones): uno por
// proceso. El worker del outbox también es de proceso y usa el `prisma` base,
// fuera de cualquier transacción de petición.
const mailer = createMailerFromEnv(env, logger);
const appBaseUrl = env.APP_BASE_URL ?? "http://localhost:5173";

// Chromium y las fuentes incrustadas son de proceso: abrir un navegador o leer
// las fuentes por petición costaría segundos y memoria en cada descarga.
const certificateExporter = createChromiumExporter({
	executablePath: env.CHROMIUM_PATH ?? null,
	noSandbox: env.CHROMIUM_NO_SANDBOX === "true",
	logger,
});
const certificateAssetSource = createCertificateAssetSource({
	storageProvider,
	storageBucket: env.STORAGE_BUCKET_NAME ?? null,
	storagePublicBucket: env.STORAGE_PUBLIC_BUCKET_NAME ?? null,
});
const certificatePdfTools = createPdfLibTools();

// Con colas, el correo lo entrega el worker de BullMQ y su barrido; el poller
// solo existe sin Redis (docs/notifications/00-notificaciones.md).
if (isEmailWorkerEnabled(env) && !queueClient) {
	const notificationRepository = createNotificationRepository({ prisma });
	startEmailOutboxWorker({
		drain: () =>
			drainOutbox({
				notificationRepository,
				mailer,
				clock: systemClock,
				logger: logger.child({ module: "email-outbox" }),
			}),
		intervalMs: env.EMAIL_WORKER_INTERVAL_S * 1000,
		logger: logger.child({ module: "email-outbox" }),
	});
}

// El estado de seguridad se consulta en CADA petición autenticada, así que la
// caché tiene que vivir entre peticiones: registrarlo con `asSingleton` daría
// una instancia por request y no cachearía nada. Va aquí, con asValue.
const securityState = createCachedSecurityStateRepository({
	inner: createSecurityStateRepository({ prisma, authConfig }),
	ttlMs: authConfig.securityStateCacheTtlS * 1000,
	logger,
	bus: createInvalidationBus({ redis, logger }),
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

/**
 * Un contenedor con todos los servicios y sin identidad. Lo usan cada petición
 * (que luego registra su `authPayload`) y el worker de colas.
 */
const createAppContainer = () => {
	const container = createContainer<ICradle>({
		injectionMode: InjectionMode.PROXY,
	});

	const asSingleton = <T>(fn: Parameters<typeof asFunction<T>>[0]) =>
		asFunction(fn, { lifetime: Lifetime.SINGLETON });

	container.register({
		prisma: asValue(prisma),
		runInTransaction: asValue(runInTransaction),
		afterCommit: asValue(afterCommit),
		aggregateCache: asValue(aggregateCache),
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
		urlSigner: asValue(urlSigner),
		securityStateRepository: asValue(securityState),
		tokenService: asSingleton(createTokenService),
		passwordService: asSingleton(createPasswordService),
		sessionRepository: asSingleton(createSessionRepository),
		authService: asSingleton(createAuthService), // ya recibe securityStateRepository vía PROXY
		sessionMonitorService: asSingleton(createSessionMonitorService),
		securityStateService: asSingleton(createSecurityStateService),
		userRepository: asSingleton(createUserRepository),
		userService: asSingleton(createUserService),
		dependencyRepository: asSingleton((cradle) =>
			createDependencyRepositoryWithInvalidation({
				inner: createDependencyRepository(cradle),
				aggregateCache: cradle.aggregateCache,
				afterCommit: cradle.afterCommit,
			}),
		),
		dependencyService: asSingleton(createDependencyService),
		trainerRepository: asSingleton(createTrainerRepository),
		trainerService: asSingleton(createTrainerService),
		groupRepository: asSingleton(createGroupRepository),
		groupService: asSingleton(createGroupService),
		courseRepository: asSingleton(createCourseRepository),
		courseService: asSingleton(createCourseService),
		contentRepository: asSingleton(createContentRepository),
		contentService: asSingleton(createContentService),
		lessonMaterialReader: asSingleton(createLessonMaterialReader),
		progressSync: asSingleton(createProgressSync),
		classroomRepository: asSingleton(createClassroomRepository),
		classroomService: asSingleton(createClassroomService),
		quizRepository: asSingleton(createQuizRepository),
		quizService: asSingleton(createQuizService),
		sessionMaterialRepository: asSingleton(createSessionMaterialRepository),
		sessionMaterialService: asSingleton(createSessionMaterialService),
		certificateRepository: asSingleton(createCertificateRepository),
		certificateService: asSingleton(createCertificateService),
		certificateIssuance: asSingleton(createCertificateIssuance),
		certificateExporter: asValue(certificateExporter),
		certificateAssetSource: asValue(certificateAssetSource),
		certificatePdfTools: asValue(certificatePdfTools),
		certificateLogoRepository: asSingleton(createCertificateLogoRepository),
		certificateLogoService: asSingleton(createCertificateLogoService),
		certificateTemplateRepository: asSingleton(
			createCertificateTemplateRepository,
		),
		certificateTemplateService: asSingleton(createCertificateTemplateService),
		enrollmentRepository: asSingleton(createEnrollmentRepository),
		enrollmentService: asSingleton(createEnrollmentService),
		calendarRepository: asSingleton(createCalendarRepository),
		calendarService: asSingleton(createCalendarService),
		teachingRepository: asSingleton(createTeachingRepository),
		teachingService: asSingleton(createTeachingService),
		completionSync: asSingleton(createCompletionSync),
		checkInService: asSingleton(createCheckInService),
		enrollmentQrService: asSingleton(createEnrollmentQrService),
		creditRepository: asSingleton((cradle) =>
			createCachedCreditRepository({
				inner: createCreditRepository(cradle),
				aggregateCache: cradle.aggregateCache,
				afterCommit: cradle.afterCommit,
			}),
		),
		creditService: asSingleton(createCreditService),
		ratingRepository: asSingleton(createRatingRepository),
		ratingService: asSingleton(createRatingService),
		annualPlanRepository: asSingleton(createAnnualPlanRepository),
		annualPlanService: asSingleton(createAnnualPlanService),
		mailer: asValue(mailer),
		appBaseUrl: asValue(appBaseUrl),
		spreadsheetWriter: asValue(createExcelSpreadsheetWriter()),
		notificationRepository: asSingleton(createNotificationRepository),
		notificationService: asSingleton(createNotificationService),
		// Una fuente por módulo que guarda keys de storage. Añadir un módulo con
		// archivos = añadir su fuente aquí; el gestor de nube no cambia.
		objectReferenceSources: asSingleton((cradle: ICradle) => [
			createUserPhotoReferenceSource(cradle),
			createCourseCoverReferenceSource(cradle),
			createLessonMaterialReferenceSource(cradle),
			createSessionMaterialReferenceSource(cradle),
			createCertificateAssetReferenceSource(cradle),
			createCertificateLogoReferenceSource(cradle),
			createCertificateTemplateReferenceSource(cradle),
		]),
		cloudService: asSingleton((cradle: ICradle) => createCloudService(cradle)),
		jobFailureRepository: asSingleton(createJobFailureRepository),
		jobDispatcher: asSingleton((cradle) =>
			createJobDispatcher({
				queues: queueClient,
				handlers: createJobHandlers(cradle),
				afterCommit: cradle.afterCommit,
				log: queueLog,
				logger,
			}),
		),
		themeRepository: asSingleton(createThemeRepository),
		themeService: asSingleton(createThemeService),
	});
	return container;
};

/** El contenedor del worker: los mismos servicios, sin petición ni sesión. */
export const createSystemContainer = () => {
	const container = createAppContainer();
	container.register({ authPayload: asValue(null) });
	return container;
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
	const freshContainer = createAppContainer();

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
