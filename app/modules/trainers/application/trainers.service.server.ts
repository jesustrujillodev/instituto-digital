import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { DuplicateEmailError } from "@/modules/users/domain/user.errors";
import type { SafeUser } from "@/modules/users/domain/user.types";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { canManageTrainer } from "../domain/trainer.access";
import { TRAINER_LIST_DEFAULTS } from "../domain/trainer.config";
import {
	DuplicateTrainerEmailError,
	ExternalTrainerRequiresInstitutionError,
	InternalTrainerCannotHaveInstitutionError,
	TrainerForbiddenScopeError,
	TrainerProfileAlreadyExistsError,
	TrainerProfileNotFoundError,
} from "../domain/trainer.errors";
import type { ITrainerService } from "../domain/trainer.service";
import type {
	ActivateProfileDto,
	CreateExternalTrainerDto,
	ListTrainersDto,
	UpdateProfileDto,
} from "../domain/trainer.types";

type Dependencies = {
	trainerRepository: ICradle["trainerRepository"];
	userRepository: ICradle["userRepository"];
	passwordService: ICradle["passwordService"];
	sessionMonitorService: ICradle["sessionMonitorService"];
	notificationService: ICradle["notificationService"];
	runInTransaction: ICradle["runInTransaction"];
	logger: ICradle["logger"];
};

export const createTrainerService = ({
	trainerRepository,
	userRepository,
	passwordService,
	sessionMonitorService,
	notificationService,
	runInTransaction,
	logger,
}: Dependencies): ITrainerService => {
	const log = logger.child({ module: "trainers" });
	const run = createOperationRunner(log);

	/**
	 * Corta el acceso de quien acaba de ganar o perder el perfil.
	 *
	 * `isTrainer` viaja firmado en el access token, así que sin esto el cambio
	 * tardaría en notarse lo que dure ese token. Best-effort a propósito: la
	 * mutación ya está confirmada y deshacerla sería peor que una ventana de
	 * sesión.
	 */
	const revokeAccess = async (userId: number) => {
		const revoked = await sessionMonitorService.revokeAllForUser(userId);

		if (!revoked.success) {
			log.warn("no se pudieron revocar las sesiones tras cambiar el perfil", {
				userId,
				code: revoked.error.code,
			});
		}
	};

	/**
	 * La cuenta sobre la que se va a operar, ya comprobada.
	 *
	 * La lectura pide alcance global a propósito: un capacitador externo no
	 * pertenece a ninguna dependencia y el alcance del titular no lo alcanzaría
	 * nunca. Quien decide de verdad es `canManageTrainer`, que reúne alcance y
	 * rango sobre la cuenta ya leída.
	 */
	const requireManageable = async (
		userDocumentId: string,
		actor: AuthContext,
	): Promise<SafeUser> => {
		const user = await userRepository.findById(userDocumentId, {
			kind: "global",
		});
		if (!user) throw new TrainerProfileNotFoundError();
		if (!canManageTrainer(actor, user)) throw new TrainerForbiddenScopeError();

		return user;
	};

	/** La institución es del externo y solo del externo. */
	const assertInstitutionCoherence = (
		type: SafeUser["type"],
		institution: string | null | undefined,
	) => {
		if (type === "EXTERNAL" && !institution) {
			throw new ExternalTrainerRequiresInstitutionError();
		}
		if (type === "INTERNAL" && institution) {
			throw new InternalTrainerCannotHaveInstitutionError();
		}
	};

	return {
		async list(filters: ListTrainersDto) {
			return run("list", async () => {
				const [data, total] = await Promise.all([
					trainerRepository.findAll(filters),
					trainerRepository.count(filters),
				]);

				return ok(data, {
					pagination: toPaginationMeta({
						page: filters.page ?? TRAINER_LIST_DEFAULTS.page,
						pageSize: filters.pageSize ?? TRAINER_LIST_DEFAULTS.pageSize,
						total,
					}),
				});
			});
		},
		async findByUser(userDocumentId: string) {
			return run("findByUser", async () => {
				const profile =
					await trainerRepository.findByUserDocumentId(userDocumentId);
				if (!profile) throw new TrainerProfileNotFoundError();

				return ok(profile);
			});
		},
		async activateProfile(dto: ActivateProfileDto, actor: AuthContext) {
			return run("activateProfile", async () => {
				const user = await requireManageable(dto.userDocumentId, actor);

				// El externo nace con perfil en `createExternal`; aquí solo se activa
				// sobre personal interno, que es lo que dice §6.3 del alcance.
				assertInstitutionCoherence(user.type, null);

				if (await trainerRepository.existsForUser(user.id)) {
					throw new TrainerProfileAlreadyExistsError();
				}

				const profile = await trainerRepository.create({
					userId: user.id,
					specialty: dto.specialty,
					institution: null,
					bio: dto.bio ?? null,
				});

				await revokeAccess(user.id);

				return ok(profile);
			});
		},
		async updateProfile(
			userDocumentId: string,
			dto: UpdateProfileDto,
			actor: AuthContext,
		) {
			return run("updateProfile", async () => {
				const user = await requireManageable(userDocumentId, actor);

				if (dto.institution !== undefined) {
					assertInstitutionCoherence(user.type, dto.institution);
				}

				// Editar los datos del perfil no toca `isTrainer`, así que no revoca:
				// echar a alguien de su sesión por corregirle la especialidad sería
				// gratuito.
				return ok(await trainerRepository.update(user.id, dto));
			});
		},
		async deactivateProfile(userDocumentId: string, actor: AuthContext) {
			return run("deactivateProfile", async () => {
				const user = await requireManageable(userDocumentId, actor);
				const profile = await trainerRepository.archive(user.id);

				await revokeAccess(user.id);

				return ok(profile);
			});
		},
		async reactivateProfile(userDocumentId: string, actor: AuthContext) {
			return run("reactivateProfile", async () => {
				const user = await requireManageable(userDocumentId, actor);
				const profile = await trainerRepository.unarchive(user.id);

				await revokeAccess(user.id);

				return ok(profile);
			});
		},
		async createExternal(dto: CreateExternalTrainerDto, actor: AuthContext) {
			return run("createExternal", async () => {
				if (!canManageTrainer(actor, EXTERNAL_TARGET)) {
					throw new TrainerForbiddenScopeError();
				}

				assertInstitutionCoherence("EXTERNAL", dto.institution);

				const password = await passwordService.hash(dto.password);

				try {
					// Las dos escrituras o ninguna: un externo sin perfil violaría §4 del
					// alcance y la base no puede impedirlo, porque el dato que decide
					// está en otra tabla. La transacción es ambiental —el cliente de
					// Prisma se resuelve por AsyncLocalStorage—, así que los dos
					// repositorios entran sin conocerse.
					return ok(
						await runInTransaction(async () => {
							const user = await userRepository.create({
								email: dto.email,
								password,
								firstName: dto.firstName,
								lastName: dto.lastName,
								phone: dto.phone,
								role: "USER",
								type: "EXTERNAL",
								dependencyId: null,
							});

							const profile = await trainerRepository.create({
								userId: user.id,
								specialty: dto.specialty,
								institution: dto.institution,
								bio: dto.bio ?? null,
							});
							await notificationService.notify([
								{ template: "ACCOUNT_CREATED", to: user },
							]);
							return profile;
						}),
					);
				} catch (error) {
					// `users` traduce el choque de correo a SU código; el catálogo expone
					// el suyo para que la copia la elija un solo diccionario.
					if (error instanceof DuplicateEmailError) {
						throw new DuplicateTrainerEmailError();
					}
					throw error;
				}
			});
		},
	};
};

/**
 * Objetivo ficticio del alta de un externo: la cuenta todavía no existe, pero
 * la decisión de permiso es la misma que sobre cualquier externo.
 */
const EXTERNAL_TARGET = {
	id: 0,
	role: "USER",
	dependencyId: null,
	type: "EXTERNAL",
} as const;
