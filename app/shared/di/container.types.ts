import type { PrismaClient } from "@prisma/client";
import { createContext } from "react-router";
import type { AfterCommit, RunInTransaction } from "@/core/db.server";
import type { Env } from "@/core/env.server";
import type { IAnnualPlanRepository } from "@/modules/annual-plan/domain/annual-plan.repository";
import type { IAnnualPlanService } from "@/modules/annual-plan/domain/annual-plan.service";
import type { AuthConfig } from "@/modules/auth/domain/auth.config";
import type { AuthService } from "@/modules/auth/domain/auth.service";
import type { VerifiedAccessTokenPayload } from "@/modules/auth/domain/auth.types";
import type { IPasswordService } from "@/modules/auth/domain/password.service";
import type { SecurityStateRepository } from "@/modules/auth/domain/security-state.repository";
import type { SecurityStateService } from "@/modules/auth/domain/security-state.service";
import type { SessionRepository } from "@/modules/auth/domain/session.repository";
import type { SessionMonitorService } from "@/modules/auth/domain/session-monitor.service";
import type { TokenService } from "@/modules/auth/domain/token.service";
import type { ICalendarRepository } from "@/modules/calendar/domain/calendar.repository";
import type { ICalendarService } from "@/modules/calendar/domain/calendar.service";
import type {
	ICertificateAssetSource,
	ICertificateExporter,
} from "@/modules/certificates/domain/certificate.exporter";
import type { ICertificatePdfTools } from "@/modules/certificates/domain/certificate.pdf";
import type { ICertificateRepository } from "@/modules/certificates/domain/certificate.repository";
import type {
	ICertificateIssuance,
	ICertificateService,
} from "@/modules/certificates/domain/certificate.service";
import type { ICertificateLogoRepository } from "@/modules/certificates/domain/certificate-logo.repository";
import type { ICertificateLogoService } from "@/modules/certificates/domain/certificate-logo.service";
import type { ICertificateTemplateRepository } from "@/modules/certificates/domain/certificate-template.repository";
import type { ICertificateTemplateService } from "@/modules/certificates/domain/certificate-template.service";
import type { ICheckInService } from "@/modules/check-in/domain/check-in.service";
import type { ICloudService } from "@/modules/cloud/domain/cloud.service";
import type { IClassroomRepository } from "@/modules/content/domain/classroom.repository";
import type {
	IClassroomService,
	ILessonMaterialReader,
	IProgressSync,
} from "@/modules/content/domain/classroom.service";
import type { IContentRepository } from "@/modules/content/domain/content.repository";
import type { IContentService } from "@/modules/content/domain/content.service";
import type { IQuizRepository } from "@/modules/content/domain/quiz.repository";
import type { IQuizService } from "@/modules/content/domain/quiz.service";
import type { ISessionMaterialRepository } from "@/modules/content/domain/session-material.repository";
import type { ISessionMaterialService } from "@/modules/content/domain/session-material.service";
import type { ICourseRepository } from "@/modules/courses/domain/course.repository";
import type { ICourseService } from "@/modules/courses/domain/course.service";
import type { ICreditRepository } from "@/modules/credits/domain/credit.repository";
import type { ICreditService } from "@/modules/credits/domain/credit.service";
import type { IDependencyRepository } from "@/modules/dependencies/domain/dependency.repository";
import type { IDependencyService } from "@/modules/dependencies/domain/dependency.service";
import type { IEnrollmentQrService } from "@/modules/enrollment-qr/domain/enrollment-qr.service";
import type { IEnrollmentRepository } from "@/modules/enrollments/domain/enrollment.repository";
import type { IEnrollmentService } from "@/modules/enrollments/domain/enrollment.service";
import type { IGroupRepository } from "@/modules/groups/domain/group.repository";
import type { IGroupService } from "@/modules/groups/domain/group.service";
import type { INotificationRepository } from "@/modules/notifications/domain/notification.repository";
import type { INotificationService } from "@/modules/notifications/domain/notification.service";
import type { IRatingRepository } from "@/modules/ratings/domain/rating.repository";
import type { IRatingService } from "@/modules/ratings/domain/rating.service";
import type { ITeachingRepository } from "@/modules/teaching/domain/teaching.repository";
import type {
	ICompletionSync,
	ITeachingService,
} from "@/modules/teaching/domain/teaching.service";
import type { IThemeRepository } from "@/modules/theme/domain/theme.repository";
import type { IThemeService } from "@/modules/theme/domain/theme.service";
import type { ITrainerRepository } from "@/modules/trainers/domain/trainer.repository";
import type { ITrainerService } from "@/modules/trainers/domain/trainer.service";
import type { IUserRepository } from "@/modules/users/domain/user.repository";
import type { IUserService } from "@/modules/users/domain/user.service";
import type { VersionedCache } from "@/shared/cache/versioned-cache";
import type { SingleFlight } from "@/shared/concurrency/single-flight";
import type { Logger } from "@/shared/logging/logger";
import type { IMailer } from "@/shared/mail/mailer.port";
import type { RateLimiter } from "@/shared/rate-limit/rate-limiter";
import type { ISpreadsheetWriter } from "@/shared/spreadsheet/spreadsheet.port";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import type { AssetUrlResolver } from "@/shared/storage/public-url";
import type { IStorageProvider } from "@/shared/storage/storage.port";
import type { UrlSigner } from "@/shared/storage/url-signer.port";
import type { Clock } from "@/shared/time/clock";

export interface ICradle {
	prisma: PrismaClient;
	/** Frontera transaccional ambiental: los repositorios que reciben `prisma` entran sin saberlo. */
	runInTransaction: RunInTransaction;
	afterCommit: AfterCommit;
	// Caché versionada de agregados caros (docs/redis/00-redis.md). Singleton de
	// proceso; sin Redis no cachea nada.
	aggregateCache: VersionedCache;
	clock: Clock;
	authConfig: AuthConfig;
	// Entorno YA validado. Se resuelve por el cradle y nunca por import directo:
	// un adaptador que importa `env` no se puede ejercitar sin el .env real.
	env: Env;
	// Bucket de objetos, derivado de env en el composition root. Los casos de uso
	// reciben ESTO y no `env`: application no debe conocer nombres de variables de
	// entorno (mismo criterio por el que existe authConfig).
	storageBucket: string | null;
	// Bucket público (STORAGE_PUBLIC_BUCKET_NAME). null = modo un solo bucket,
	// que es el comportamiento por defecto: todo vive en storageBucket.
	storagePublicBucket: string | null;
	// Traduce una key a la URL con la que se PINTA: la del CDN si el objeto es
	// público y hay dominio configurado, la referencia del proxy si no. Se inyecta
	// ya construido para que el dominio no tenga que leer variables de entorno.
	assetUrlResolver: AssetUrlResolver;
	// Verified JWT payload for the current request — set by configureContainer.
	// null for anonymous requests or after a failed refresh.
	authPayload: VerifiedAccessTokenPayload | null;
	// Singletons de proceso (viven ENTRE peticiones — ver container.server.ts):
	singleFlight: SingleFlight;
	rateLimiter: RateLimiter;
	logger: Logger;
	// Estado de seguridad CACHEADO. Singleton de proceso por la caché: registrarlo
	// con asSingleton daría una instancia por petición y no cachearía nada.
	securityStateRepository: SecurityStateRepository;
	// Proveedor de almacenamiento de objetos (S3/GCS según STORAGE_PROVIDER).
	// Singleton de proceso: cierra sobre el cliente del SDK — ver container.server.ts.
	storageProvider: IStorageProvider;
	// Firmas de lectura reutilizables (en Redis si hay, si no en el proceso).
	// Singleton de proceso por la caché que lleva dentro.
	urlSigner: UrlSigner;
	// Quién usa cada objeto de storage. Cada módulo que guarda keys en sus tablas
	// aporta su fuente; el gestor de nube las consulta sin conocer los módulos.
	objectReferenceSources: IObjectReferenceSource[];
	// Gestor de archivos en la nube (panel de admin): listar, descargar, borrar
	// en cascada y detectar huérfanos sobre los dos buckets.
	cloudService: ICloudService;
	userRepository: IUserRepository;
	userService: IUserService;
	dependencyRepository: IDependencyRepository;
	dependencyService: IDependencyService;
	trainerRepository: ITrainerRepository;
	trainerService: ITrainerService;
	groupRepository: IGroupRepository;
	groupService: IGroupService;
	courseRepository: ICourseRepository;
	courseService: ICourseService;
	contentRepository: IContentRepository;
	contentService: IContentService;
	// El aula del participante (docs/adr/0014). `progressSync` es la única vía
	// que escribe el caché del avance; la usan el aula y los cambios del temario.
	lessonMaterialReader: ILessonMaterialReader;
	progressSync: IProgressSync;
	classroomRepository: IClassroomRepository;
	classroomService: IClassroomService;
	// Cuestionarios autocalificados: examen final y práctica (docs/adr/0015).
	quizRepository: IQuizRepository;
	quizService: IQuizService;
	// Material de apoyo de cada sesión (docs/adr/0026).
	sessionMaterialRepository: ISessionMaterialRepository;
	sessionMaterialService: ISessionMaterialService;
	// Certificado por curso, con borrador y publicado (docs/adr/0018).
	certificateRepository: ICertificateRepository;
	certificateService: ICertificateService;
	certificateIssuance: ICertificateIssuance;
	certificateExporter: ICertificateExporter;
	certificateAssetSource: ICertificateAssetSource;
	certificatePdfTools: ICertificatePdfTools;
	// Logos institucionales, inmutables y versionados (docs/adr/0030).
	certificateLogoRepository: ICertificateLogoRepository;
	certificateLogoService: ICertificateLogoService;
	// Biblioteca de plantillas de certificado (docs/adr/0030).
	certificateTemplateRepository: ICertificateTemplateRepository;
	certificateTemplateService: ICertificateTemplateService;
	enrollmentRepository: IEnrollmentRepository;
	enrollmentService: IEnrollmentService;
	calendarRepository: ICalendarRepository;
	calendarService: ICalendarService;
	teachingRepository: ITeachingRepository;
	teachingService: ITeachingService;
	// Recalcula completado y créditos de un curso. Lo comparten la impartición y
	// el avance por lección, que es quien completa un autogestivo (docs/adr/0014).
	completionSync: ICompletionSync;
	checkInService: ICheckInService;
	enrollmentQrService: IEnrollmentQrService;
	creditRepository: ICreditRepository;
	creditService: ICreditService;
	ratingRepository: IRatingRepository;
	ratingService: IRatingService;
	annualPlanRepository: IAnnualPlanRepository;
	annualPlanService: IAnnualPlanService;
	// Correo (PRD-08). El mailer es singleton de proceso: cierra sobre el
	// transporte SMTP. `appBaseUrl` llega resuelto para que las plantillas no
	// lean variables de entorno, igual que `storageBucket`.
	mailer: IMailer;
	appBaseUrl: string;
	// Genera los .xlsx que se descargan. Sin estado: se inyecta para que las
	// rutas que exportan se prueben sin armar un libro real.
	spreadsheetWriter: ISpreadsheetWriter;
	notificationRepository: INotificationRepository;
	notificationService: INotificationService;
	// Preferencia de modo claro/oscuro por usuario. El loader raíz la resuelve en
	// TODA petición, así que `resolveMode` evita bajar a la base salvo en el caso
	// de dispositivo nuevo (docs/theme/00-modo-oscuro.md).
	themeRepository: IThemeRepository;
	themeService: IThemeService;
	passwordService: IPasswordService;
	sessionRepository: SessionRepository;
	tokenService: TokenService;
	authService: AuthService;
	// Monitor de sesiones (panel de admin). Separado de authService: opera sobre
	// sesiones de terceros y solo lo consumen rutas tras un requireRole.
	sessionMonitorService: SessionMonitorService;
	// Casos de uso del lockdown de plataforma. Separado del monitor: opera sobre
	// la política global, no sobre sesiones concretas.
	securityStateService: SecurityStateService;
}

// Typed React Router context key — the middleware stores the resolved cradle
// here so loaders/actions can read it via context.get(containerContext).
export const containerContext = createContext<ICradle | null>(null);
