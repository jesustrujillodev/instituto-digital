import type { PrismaClient } from "@prisma/client";
import { createContext } from "react-router";
import type { RunInTransaction } from "@/core/db.server";
import type { Env } from "@/core/env.server";
import type { AuthConfig } from "@/modules/auth/domain/auth.config";
import type { AuthService } from "@/modules/auth/domain/auth.service";
import type { VerifiedAccessTokenPayload } from "@/modules/auth/domain/auth.types";
import type { IPasswordService } from "@/modules/auth/domain/password.service";
import type { SecurityStateRepository } from "@/modules/auth/domain/security-state.repository";
import type { SecurityStateService } from "@/modules/auth/domain/security-state.service";
import type { SessionRepository } from "@/modules/auth/domain/session.repository";
import type { SessionMonitorService } from "@/modules/auth/domain/session-monitor.service";
import type { TokenService } from "@/modules/auth/domain/token.service";
import type { ICloudService } from "@/modules/cloud/domain/cloud.service";
import type { IDependencyRepository } from "@/modules/dependencies/domain/dependency.repository";
import type { IDependencyService } from "@/modules/dependencies/domain/dependency.service";
import type { IGroupRepository } from "@/modules/groups/domain/group.repository";
import type { IGroupService } from "@/modules/groups/domain/group.service";
import type { IThemeRepository } from "@/modules/theme/domain/theme.repository";
import type { IThemeService } from "@/modules/theme/domain/theme.service";
import type { ITrainerRepository } from "@/modules/trainers/domain/trainer.repository";
import type { ITrainerService } from "@/modules/trainers/domain/trainer.service";
import type { IUserRepository } from "@/modules/users/domain/user.repository";
import type { IUserService } from "@/modules/users/domain/user.service";
import type { SingleFlight } from "@/shared/concurrency/single-flight";
import type { Logger } from "@/shared/logging/logger";
import type { RateLimiter } from "@/shared/rate-limit/rate-limiter";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import type { AssetUrlResolver } from "@/shared/storage/public-url";
import type { IStorageProvider } from "@/shared/storage/storage.port";

export interface ICradle {
	prisma: PrismaClient;
	/** Frontera transaccional ambiental: los repositorios que reciben `prisma` entran sin saberlo. */
	runInTransaction: RunInTransaction;
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
	// Tema de la plataforma y preferencia de modo por usuario. El loader raíz lo
	// resuelve en TODA petición, así que `resolve` evita bajar a la base salvo en
	// el caso de dispositivo nuevo (docs/theme/00-modo-oscuro.md).
	//
	// El repositorio va CACHEADO en el tema activo, y por eso es un singleton de
	// proceso igual que `securityStateRepository`: con `asSingleton` sería una
	// instancia por petición y no cachearía nada (docs/theme/01-theme-builder.md).
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
