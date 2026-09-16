import { endOfZonedDay, zonedInputToUtc } from "@/lib/date-utils";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	type CourseScope,
	canChooseOrganizer,
	resolveCourseScope,
	resolveOrganizerDependency,
	toAudienceScope,
} from "../domain/course.access";
import { COURSE_DEFAULTS, COURSE_LIST_DEFAULTS } from "../domain/course.config";
import {
	CourseDependencyInactiveError,
	CourseForbiddenScopeError,
	CourseInvalidTransitionError,
	CourseNotEditableError,
	CourseNotFoundError,
	CourseOrganizerRequiredError,
	CourseUnknownAudienceError,
	CourseUnknownTrainerError,
} from "../domain/course.errors";
import {
	assertCapacityCovers,
	assertDeadlineBeforeStart,
	assertPublishable,
	assertSessionLimit,
	assertSessionRange,
	canCancel,
	canEdit,
} from "../domain/course.rules";
import type { ICourseService } from "../domain/course.service";
import type {
	CourseDetail,
	CourseSessionData,
	CourseWriteData,
	CreateCourseDto,
	ListCoursesDto,
	UpdateCourseDto,
} from "../domain/course.types";

type Dependencies = {
	courseRepository: ICradle["courseRepository"];
	dependencyRepository: ICradle["dependencyRepository"];
	trainerRepository: ICradle["trainerRepository"];
	groupRepository: ICradle["groupRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	runInTransaction: ICradle["runInTransaction"];
	logger: ICradle["logger"];
};

/** Sin repetidos: un id duplicado desajustaría el conteo de elegibles. */
const unique = (values: readonly string[]): string[] => [...new Set(values)];

export const createCourseService = ({
	courseRepository,
	dependencyRepository,
	trainerRepository,
	groupRepository,
	enrollmentRepository,
	runInTransaction,
	logger,
}: Dependencies): ICourseService => {
	const log = logger.child({ module: "courses" });
	const run = createOperationRunner(log);

	/** El alcance con el que se escribe, o corte. */
	const requireWriteScope = (actor: AuthContext): CourseScope => {
		const scope = resolveCourseScope(actor);

		if (scope.kind === "none") throw new CourseForbiddenScopeError();

		return scope;
	};

	/** El curso, ya comprobado contra el alcance de quien lo pide. */
	const requireCourse = async (
		documentId: string,
		scope: CourseScope,
	): Promise<CourseDetail> => {
		const course = await courseRepository.findById(documentId, scope);
		if (!course) throw new CourseNotFoundError();

		return course;
	};

	/**
	 * La dependencia organizadora, resuelta a su id interno y comprobada.
	 *
	 * La regla de quién la elige es pura y vive en `course.access.ts`; aquí solo
	 * se traduce el id público y se comprueba que la unidad siga activa, que es
	 * lo mismo que exige el alta de un grupo.
	 */
	const resolveOrganizer = async (
		requested: string | undefined,
		scope: CourseScope,
	): Promise<number> => {
		const chosen =
			canChooseOrganizer(scope) && requested
				? await dependencyRepository.findById(requested)
				: null;

		const dependencyId = resolveOrganizerDependency(scope, chosen?.id);
		const dependency =
			chosen ?? (await dependencyRepository.findByInternalId(dependencyId));

		if (!dependency) throw new CourseOrganizerRequiredError();
		if (dependency.archivedAt) throw new CourseDependencyInactiveError();

		return dependencyId;
	};

	/**
	 * Del formulario a lo que el repositorio escribe.
	 *
	 * Aquí muere la hora de pared: a partir de este punto todo son instantes UTC
	 * y ninguna capa vuelve a hablar de zonas horarias. Aquí también se rechazan
	 * los lotes incompletos, como hace el alta de miembros de un grupo: asignar
	 * solo lo válido dejaría un curso silenciosamente distinto del que se pidió.
	 */
	const buildWriteData = async (
		dto: CreateCourseDto | UpdateCourseDto,
		scope: CourseScope,
	): Promise<CourseWriteData> => {
		assertSessionLimit(dto.sessions.length);

		const sessions: CourseSessionData[] = dto.sessions
			.map((session, index) => {
				assertSessionRange(session, index + 1);

				return {
					documentId: session.documentId,
					startsAt: zonedInputToUtc(session.date, session.startTime),
					endsAt: zonedInputToUtc(session.date, session.endTime),
					venue: session.venue ?? null,
					link: session.link ?? null,
				};
			})
			.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

		const enrollmentDeadline = dto.enrollmentDeadline
			? endOfZonedDay(dto.enrollmentDeadline)
			: null;

		assertDeadlineBeforeStart(
			enrollmentDeadline,
			sessions.at(0)?.startsAt ?? null,
		);

		// La audiencia solo existe cuando el acceso es restringido (§5): cambiar a
		// público o a por invitación tiene que limpiarla, no dejarla latente.
		const wantsAudience = dto.access === "RESTRICTED";
		const dependencyDocumentIds = wantsAudience
			? unique(dto.audienceDependencies ?? [])
			: [];
		const groupDocumentIds = wantsAudience
			? unique(dto.audienceGroups ?? [])
			: [];
		const trainerDocumentIds = unique(dto.trainers);

		const [trainers, dependencies, groups] = await Promise.all([
			courseRepository.findEligibleTrainers(trainerDocumentIds),
			courseRepository.findEligibleDependencies(dependencyDocumentIds),
			courseRepository.findEligibleGroups(
				groupDocumentIds,
				toAudienceScope(scope),
			),
		]);

		if (trainers.length !== trainerDocumentIds.length) {
			throw new CourseUnknownTrainerError();
		}
		if (
			dependencies.length !== dependencyDocumentIds.length ||
			groups.length !== groupDocumentIds.length
		) {
			throw new CourseUnknownAudienceError();
		}

		return {
			title: dto.title,
			description: dto.description ?? null,
			modality: dto.modality,
			access: dto.access,
			capacity: dto.capacity ?? null,
			enrollmentDeadline,
			minAttendance: dto.minAttendance ?? COURSE_DEFAULTS.minAttendance,
			requiresEvaluation: dto.requiresEvaluation ?? false,
			sessions,
			trainerIds: trainers.map((trainer) => trainer.id),
			audienceDependencyIds: dependencies.map((entry) => entry.id),
			audienceGroupIds: groups.map((entry) => entry.id),
		};
	};

	return {
		async list(filters: ListCoursesDto, scope: CourseScope) {
			return run("list", async () => {
				// En paralelo: la página y el total comparten filtros pero son
				// consultas independientes, y encadenarlas duplicaría la latencia.
				const [data, total] = await Promise.all([
					courseRepository.findAll(filters, scope),
					courseRepository.count(filters, scope),
				]);

				return ok(data, {
					pagination: toPaginationMeta({
						page: filters.page ?? COURSE_LIST_DEFAULTS.page,
						pageSize: filters.pageSize ?? COURSE_LIST_DEFAULTS.pageSize,
						total,
					}),
				});
			});
		},
		async findById(documentId: string, scope: CourseScope) {
			return run("findById", async () =>
				ok(await requireCourse(documentId, scope)),
			);
		},
		async listFormOptions(scope: CourseScope) {
			return run("listFormOptions", async () => {
				const choosesOrganizer = canChooseOrganizer(scope);

				const [trainers, dependencies, groups] = await Promise.all([
					// El catálogo de capacitadores es global (§4): cualquier organizador
					// puede asignar a cualquiera que esté activo.
					trainerRepository.findActive(),
					dependencyRepository.findActive(),
					groupRepository.findActive(toAudienceScope(scope)),
				]);

				return ok({
					trainers: trainers.map((trainer) => ({
						documentId: trainer.userDocumentId,
						firstName: trainer.firstName,
						lastName: trainer.lastName,
						email: trainer.email,
						specialty: trainer.specialty,
					})),
					organizers: choosesOrganizer
						? dependencies.map(({ documentId, name }) => ({ documentId, name }))
						: [],
					audienceDependencies: dependencies.map(({ documentId, name }) => ({
						documentId,
						name,
					})),
					audienceGroups: groups.map(
						({ documentId, name, dependencyName }) => ({
							documentId,
							name,
							dependencyName,
						}),
					),
					canChooseOrganizer: choosesOrganizer,
				});
			});
		},
		async create(dto: CreateCourseDto, actor: AuthContext) {
			return run("create", async () => {
				const scope = requireWriteScope(actor);
				const dependencyId = await resolveOrganizer(dto.dependency, scope);
				const data = await buildWriteData(dto, scope);

				// Curso, sesiones, capacitadores y audiencia son una sola escritura
				// (reglas §8.1): un curso a medias no es un borrador, es basura.
				return ok(
					await runInTransaction(() =>
						courseRepository.create({
							...data,
							dependencyId,
							createdById: actor.userId,
						}),
					),
				);
			});
		},
		async update(documentId: string, dto: UpdateCourseDto, actor: AuthContext) {
			return run("update", async () => {
				const scope = requireWriteScope(actor);
				const course = await requireCourse(documentId, scope);

				if (!canEdit(course.status)) {
					throw new CourseNotEditableError(course.status);
				}

				const data = await buildWriteData(dto, scope);

				return ok(
					await runInTransaction(async () => {
						const { enrolled } = await enrollmentRepository.lockCourseSeats(
							course.id,
						);
						assertCapacityCovers(data.capacity, enrolled);

						return courseRepository.update(documentId, data, scope);
					}),
				);
			});
		},
		async publish(documentId: string, actor: AuthContext) {
			return run("publish", async () => {
				const scope = requireWriteScope(actor);
				const course = await requireCourse(documentId, scope);

				// Falla con el código de la condición que faltó, no con uno genérico:
				// es lo que permite decir QUÉ sesión se quedó sin sede.
				assertPublishable(course);

				return ok(await courseRepository.publish(documentId, scope));
			});
		},
		async cancel(documentId: string, actor: AuthContext) {
			return run("cancel", async () => {
				const scope = requireWriteScope(actor);
				const course = await requireCourse(documentId, scope);

				if (!canCancel(course.status)) {
					throw new CourseInvalidTransitionError(course.status, "CANCELLED");
				}

				return ok(await courseRepository.cancel(documentId, scope));
			});
		},
	};
};
