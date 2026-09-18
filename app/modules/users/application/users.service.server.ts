import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { type AccessScope, resolveScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { buildObjectKey } from "@/shared/storage/object-key";
import { bucketForKey } from "@/shared/storage/storage.policy";
import {
	type UploadInput,
	validateUploadInput,
} from "@/shared/storage/upload-validation";
import {
	canAssignRole,
	canChangeUserDependency,
	canManageUser,
	roleAfterDependencyChange,
} from "../domain/user.access.rules";
import { USER_LIST_DEFAULTS, USER_PHOTO } from "../domain/user.config";
import {
	EmployeeNumberRequiredError,
	ExternalUserRequiresTrainerProfileError,
	ForbiddenScopeError,
	HeadCannotLeaveDependencyError,
	InvalidCurrentPasswordError,
	InvalidUploadError,
	UserDependencyInactiveError,
	UserDependencyNotFoundError,
	UserNotArchivedError,
	UserNotFoundError,
} from "../domain/user.errors";
import type { IUserService } from "../domain/user.service";
import type {
	CreateUserDto,
	ListUsersDto,
	UpdateUserDto,
} from "../domain/user.types";

type Dependencies = {
	userRepository: ICradle["userRepository"];
	// Lo consume el alta para comprobar que la dependencia destino exista y esté
	// activa. Se declara contra el PUERTO, nunca contra la implementación.
	dependencyRepository: ICradle["dependencyRepository"];
	// Corta el acceso en el acto cuando cambia el rol o la dependencia: el epoch
	// invalida el access token vivo y el borrado de sesiones mata la renovación.
	sessionMonitorService: ICradle["sessionMonitorService"];
	passwordService: ICradle["passwordService"];
	storageProvider: ICradle["storageProvider"];
	// El bucket llega resuelto desde el composition root: este caso de uso no lee
	// `env` ni conoce el nombre de la variable (docs/reglas.md §11.4).
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
	notificationService: ICradle["notificationService"];
	runInTransaction: ICradle["runInTransaction"];
	logger: ICradle["logger"];
};

export const createUserService = ({
	userRepository,
	dependencyRepository,
	sessionMonitorService,
	passwordService,
	storageProvider,
	storageBucket,
	storagePublicBucket,
	notificationService,
	runInTransaction,
	logger,
}: Dependencies): IUserService => {
	const log = logger.child({ module: "users" });

	// Toda operación pasa por el runner: es lo que convierte los errores que
	// lanzan el repositorio y valibot en la rama `success: false` del envelope, y
	// lo que registra los inesperados. Sin él, un throw se colaría hasta el
	// loader y el contrato dejaría de ser predecible.
	const run = createOperationRunner(log);

	/**
	 * La cuenta, solo si el actor puede administrarla.
	 *
	 * Reúne las dos condiciones que toda mutación sobre una cuenta tiene que
	 * cumplir, y la asimetría de sus respuestas es deliberada:
	 *
	 * - Fuera de ALCANCE responde `USER_NOT_FOUND`, igual que una cuenta
	 *   inexistente. Un mensaje distinto confirmaría que la cuenta existe.
	 * - Con alcance pero sin RANGO responde `FORBIDDEN_SCOPE`. Aquí el actor ya
	 *   conoce la cuenta —está en su dependencia— y lo que le falta es autoridad;
	 *   un 404 le haría buscar un problema que no existe.
	 */
	const requireManageable = async (documentId: string, actor: AuthContext) => {
		const scope = resolveScope(actor);

		const user = await userRepository.findById(documentId, scope);
		if (!user) throw new UserNotFoundError();
		if (!canManageUser(actor, user)) throw new ForbiddenScopeError();

		return { user, scope };
	};

	/**
	 * Comprueba la dependencia destino de un alta o de un traslado.
	 *
	 * Vive en el servicio y no en la base porque la FK solo garantiza que exista,
	 * no que esté activa: una dependencia desactivada no admite personal nuevo
	 * (regla 8) y eso es una regla de negocio, no de integridad referencial.
	 */
	const resolveTargetDependency = async (documentDependencyId: string) => {
		const dependency =
			await dependencyRepository.findById(documentDependencyId);
		if (!dependency) throw new UserDependencyNotFoundError();
		if (dependency.archivedAt) throw new UserDependencyInactiveError();

		return dependency;
	};

	/** Best-effort, como el reseteo de contraseña: la escritura ya está hecha. */
	const revokeAccess = async (userId: number, reason: string) => {
		const revoked = await sessionMonitorService.revokeAllForUser(userId);

		if (!revoked.success) {
			log.warn("no se pudieron revocar las sesiones", {
				userId,
				reason,
				code: revoked.error.code,
			});
		}
	};

	return {
		async list(filters: ListUsersDto, scope: AccessScope) {
			return run("list", async () => {
				// En paralelo: la página y el total comparten filtros Y alcance, pero son
				// consultas independientes, y encadenarlas duplicaría la latencia.
				const [data, total] = await Promise.all([
					userRepository.findAll(filters, scope),
					userRepository.count(filters, scope),
				]);

				return ok(data, {
					pagination: toPaginationMeta({
						page: filters.page ?? USER_LIST_DEFAULTS.page,
						pageSize: filters.pageSize ?? USER_LIST_DEFAULTS.pageSize,
						total,
					}),
				});
			});
		},

		async findById(documentId: string, scope: AccessScope) {
			return run("findById", async () => {
				const user = await userRepository.findById(documentId, scope);
				// Fuera de alcance se ve igual que inexistente. Es el resultado correcto
				// en seguridad: no confirma que la cuenta exista.
				if (!user) throw new UserNotFoundError();

				return ok(user);
			});
		},

		async listDependencyHistory(documentId: string, scope: AccessScope) {
			return run("listDependencyHistory", async () =>
				ok(await userRepository.listDependencyHistory(documentId, scope)),
			);
		},

		async create(dto: CreateUserDto, actor: AuthContext) {
			return run("create", async () => {
				const scope = resolveScope(actor);
				const role = dto.role ?? "USER";

				// Nadie otorga un rol por encima del suyo (regla 10). Se comprueba en el
				// servidor y no solo al pintar el Select: ocultar una opción no es una
				// regla de negocio y el formulario se puede enviar a mano.
				if (!canAssignRole(actor.role, role)) throw new ForbiddenScopeError();

				// Todo externo tiene perfil de capacitador (§4 del alcance), y esa
				// invariante cruza dos tablas: la base no puede imponerla. La sostienen
				// los dos únicos caminos que escriben `type`, y este es el que dice que
				// no — el alta de externos vive en el catálogo de capacitadores, que
				// crea cuenta y perfil en la misma transacción.
				if (dto.type === "EXTERNAL") {
					throw new ExternalUserRequiresTrainerProfileError();
				}

				// La regla de valibot ya lo exige en la frontera; esto cubre la escritura
				// que no pasa por un formulario antes de que el CHECK de la base la
				// rechace con un error sin código de dominio.
				if (!dto.employeeNumber) {
					throw new EmployeeNumberRequiredError();
				}

				const dependencyId = await (async () => {
					switch (scope.kind) {
						// Un titular o un auxiliar solo dan de alta en SU dependencia. Se
						// ignora lo que pida el formulario en vez de rechazarlo: el campo
						// llega fijo y deshabilitado, así que otro valor solo puede venir de
						// un envío manipulado, y forzar el propio es más seguro que fallar.
						case "dependency":
							return scope.dependencyId;
						case "global": {
							// El superadministrador es el único interno exento, porque su
							// alcance no es una dependencia.
							if (!dto.dependency) {
								if (role === "SUPERADMIN") return null;
								throw new UserDependencyNotFoundError();
							}
							return (await resolveTargetDependency(dto.dependency)).id;
						}
						// Un participante no da de alta a nadie, y un titular sin
						// dependencia tampoco: no hay destino que sea el suyo.
						default:
							throw new ForbiddenScopeError();
					}
				})();

				// El dto de frontera trae `dependency` (documentId público) y la
				// contraseña en claro; lo que se persiste lleva el id interno y el hash.
				const { dependency: _dependency, password, ...rest } = dto;

				const hashedPassword = await passwordService.hash(password);

				return ok(
					await runInTransaction(async () => {
						const created = await userRepository.create({
							...rest,
							password: hashedPassword,
							dependencyId,
						});
						// El aviso nunca lleva la contraseña: se entrega por canal privado (§6.1).
						await notificationService.notify([
							{ template: "ACCOUNT_CREATED", to: created },
						]);
						return created;
					}),
				);
			});
		},

		async update(documentId: string, dto: UpdateUserDto, actor: AuthContext) {
			return run("update", async () => {
				const { scope } = await requireManageable(documentId, actor);

				// Cambiar el rol sigue las mismas reglas que otorgarlo al crear.
				if (dto.role && !canAssignRole(actor.role, dto.role)) {
					throw new ForbiddenScopeError();
				}

				const user = await userRepository.update(documentId, dto, scope);

				// Un cambio de rol viaja en el token: sin revocar, el afectado seguiría
				// operando con el anterior hasta que expirara (regla 11).
				if (dto.role && dto.role !== user.role) {
					await revokeAccess(user.id, "role-change");
				}

				return ok(user);
			});
		},

		async updatePhoto(
			documentId: string,
			file: UploadInput,
			actor: AuthContext,
		) {
			return run("updatePhoto", async () => {
				const { scope } = await requireManageable(documentId, actor);

				// Misma validación que corre el cliente (user.config.ts): allí es UX,
				// aquí es la que manda.
				const reason = validateUploadInput(file, {
					allowedTypes: USER_PHOTO.allowedTypes,
					maxBytes: USER_PHOTO.maxBytes,
				});
				if (reason) throw new InvalidUploadError(reason);

				// Error de configuración, no de negocio: sale como UNEXPECTED_ERROR y
				// se registra con su mensaje real, que es lo que necesita quien opera.
				if (!storageBucket) {
					throw new Error("STORAGE_BUCKET_NAME no configurado");
				}

				const key = buildObjectKey(USER_PHOTO.prefix, file.name);
				const body = Buffer.from(await file.arrayBuffer());

				// El bucket lo decide la key. Hoy `profile-photos/` no está entre los
				// prefijos del CDN, así que resuelve al bucket por defecto; se pasa por
				// la política igualmente para que un cambio de prefijos no deje esta
				// subida escribiendo en el bucket equivocado.
				const bucket = bucketForKey(key, {
					defaultBucket: storageBucket,
					publicBucket: storagePublicBucket,
				});

				await storageProvider.uploadFile(bucket, key, body, file.type);

				// Se persiste la referencia del proxy, no la URL del proveedor: así
				// cambiar S3↔GCS no invalida lo guardado (ver prisma/schema.prisma).
				const photoUrl = storageProvider.getPublicUrl(bucket, key);

				return ok(
					await userRepository.updatePhoto(documentId, photoUrl, scope),
				);
			});
		},

		async resetPassword(
			documentId: string,
			newPassword: string,
			actor: AuthContext,
		) {
			return run("resetPassword", async () => {
				const { user, scope } = await requireManageable(documentId, actor);

				const hashedPassword = await passwordService.hash(newPassword);
				await runInTransaction(async () => {
					await userRepository.updatePassword(
						documentId,
						hashedPassword,
						scope,
					);
					await notificationService.notify([
						{ template: "PASSWORD_RESET", to: user },
					]);
				});

				return ok(user);
			});
		},

		async archive(documentId: string, actor: AuthContext) {
			return run("archive", async () => {
				const { scope } = await requireManageable(documentId, actor);

				const user = await userRepository.archive(documentId, scope);

				// Sin esto, "un usuario inactivo no puede iniciar sesión" solo se
				// cumpliría al expirar su access token vigente: durante ese rato
				// seguiría operando con normalidad. El epoch corta el token en curso y
				// el borrado de sesiones corta la renovación; hacen falta las dos.
				await revokeAccess(user.id, "archived");

				return ok(user);
			});
		},

		async unarchive(documentId: string, actor: AuthContext) {
			return run("unarchive", async () => {
				const { scope } = await requireManageable(documentId, actor);

				return ok(await userRepository.unarchive(documentId, scope));
			});
		},

		async delete(documentId: string, actor: AuthContext) {
			return run("delete", async () => {
				const { user, scope } = await requireManageable(documentId, actor);

				// El borrado permanente exige archivar antes: obliga a un segundo acto
				// deliberado sobre una acción irreversible. La comprobación vive aquí y
				// no en la UI porque ocultar un botón no es una regla de negocio.
				if (!user.archivedAt) throw new UserNotArchivedError();

				// Puede lanzar UserHasRelatedRecordsError si alguna FK lo impide.
				await userRepository.delete(documentId, scope);

				return ok(null);
			});
		},

		async changeOwnPassword(dto, actor: AuthContext) {
			return run("changeOwnPassword", async () => {
				// Se relee por correo porque es la única lectura que conserva el hash: el
				// resto del módulo devuelve SafeUser justamente para que no circule.
				const user = await userRepository.findByEmail(actor.email);
				if (!user?.password) throw new UserNotFoundError();

				const valid = await passwordService.compare(
					dto.currentPassword,
					user.password,
				);
				if (!valid) throw new InvalidCurrentPasswordError();

				await userRepository.updatePassword(
					actor.documentId,
					await passwordService.hash(dto.newPassword),
					resolveScope(actor),
				);

				return ok(null);
			});
		},

		async changeDependency(
			documentId: string,
			toDependencyDocumentId: string,
			actor: AuthContext,
		) {
			return run("changeDependency", async () => {
				const scope = resolveScope(actor);

				const user = await userRepository.findById(documentId, scope);
				if (!user) throw new UserNotFoundError();

				if (!canChangeUserDependency(actor, user)) {
					throw new ForbiddenScopeError();
				}
				// Regla 6: relevar al titular se hace designando a otro desde la
				// dependencia, no como efecto colateral de un traslado.
				if (user.role === "DEPENDENCY_HEAD") {
					throw new HeadCannotLeaveDependencyError();
				}

				const dependency = await resolveTargetDependency(
					toDependencyDocumentId,
				);

				// Moverse a la dependencia en la que ya está no escribe bitácora ni
				// cierra sesiones: una línea de historial sin cambio sería ruido.
				if (user.dependencyId === dependency.id) return ok(user);

				const fromDependency =
					user.dependencyId !== null
						? await dependencyRepository.findByInternalId(user.dependencyId)
						: null;

				const updated = await runInTransaction(async () => {
					const moved = await userRepository.changeDependency({
						documentId,
						toDependencyId: dependency.id,
						changedById: actor.userId,
						// Auxiliar y titular son cargos DE una dependencia: se pierden al salir.
						nextRole: roleAfterDependencyChange(user.role),
						scope,
					});
					await notificationService.notify([
						{
							template: "DEPENDENCY_CHANGED",
							to: moved,
							fromDependency: fromDependency?.name ?? null,
							toDependency: dependency.name,
						},
					]);
					return moved;
				});

				// El claim `dependencyId` viaja firmado: sin revocar, el alcance nuevo no
				// valdría hasta que expirara el token (regla 11).
				await revokeAccess(updated.id, "dependency-change");

				return ok(updated);
			});
		},
	};
};
