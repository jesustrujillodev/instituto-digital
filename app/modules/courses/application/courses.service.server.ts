import { endOfZonedDay, zonedInputToUtc } from "@/lib/date-utils";
import { assertLineAvailableForCourse } from "@/modules/annual-plan/domain/annual-plan.rules";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { NotifiableParticipant } from "@/modules/enrollments/domain/enrollment.types";
import {
	toNotifiedCourse,
	toNotifiedSessions,
} from "@/modules/notifications/domain/notification.mapper";
import type { NotificationEvent } from "@/modules/notifications/domain/notification.types";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { bucketForKey } from "@/shared/storage/storage.policy";
import {
	type StorageTxDeps,
	withStorageTransaction,
} from "@/shared/storage/storage.transaction";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import {
	type UploadInput,
	validateUploadInput,
} from "@/shared/storage/upload-validation";
import {
	type CourseScope,
	canChooseOrganizer,
	resolveCourseScope,
	resolveOrganizerDependency,
	toAudienceScope,
} from "../domain/course.access";
import {
	COURSE_COVER,
	COURSE_DEFAULTS,
	COURSE_LIST_DEFAULTS,
} from "../domain/course.config";
import {
	CourseCoverInvalidError,
	CourseDependencyInactiveError,
	CourseForbiddenScopeError,
	CourseInvalidTransitionError,
	CourseNotEditableError,
	CourseNotFoundError,
	CourseOrganizerRequiredError,
	CoursePlanLineNotFoundError,
	CourseUnknownAudienceError,
	CourseUnknownTrainerError,
} from "../domain/course.errors";
import {
	assertCapacityCovers,
	assertCompletionRuleCoherent,
	assertCompletionSettingsEditable,
	assertDeadlineBeforeStart,
	assertFormatEditable,
	assertPublishable,
	assertSessionLimit,
	assertSessionRange,
	type CourseCompletionRule,
	type CourseContentFacts,
	type CourseFormat,
	canCancel,
	canEdit,
	type EvaluationMethod,
	evaluatesByQuiz,
	hasScheduleChanges,
	requiresContent,
	requiresSessions,
	requiresTrainer,
	resolveEvaluationMethod,
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
	// El conteo de lecciones vive en `content` y este caso de uso solo lo LEE:
	// entra el repositorio y no el servicio, que crearía un ciclo entre módulos.
	contentRepository: ICradle["contentRepository"];
	dependencyRepository: ICradle["dependencyRepository"];
	trainerRepository: ICradle["trainerRepository"];
	groupRepository: ICradle["groupRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	annualPlanRepository: ICradle["annualPlanRepository"];
	notificationService: ICradle["notificationService"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
	// Storage llega por el cradle, nunca por import: el caso de uso depende del
	// puerto, y una prueba lo sustituye por un doble sin levantar ningún SDK.
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

/** Sin repetidos: un id duplicado desajustaría el conteo de elegibles. */
const unique = (values: readonly string[]): string[] => [...new Set(values)];

export const createCourseService = ({
	courseRepository,
	contentRepository,
	dependencyRepository,
	trainerRepository,
	groupRepository,
	enrollmentRepository,
	annualPlanRepository,
	notificationService,
	runInTransaction,
	clock,
	logger,
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ICourseService => {
	const log = logger.child({ module: "courses" });
	const run = createOperationRunner(log);

	/** El alcance con el que se escribe, o corte. */
	const requireWriteScope = (actor: AuthContext): CourseScope => {
		const scope = resolveCourseScope(actor);

		if (scope.kind === "none") throw new CourseForbiddenScopeError();

		return scope;
	};

	/**
	 * Lo que el temario y el examen aportan a la publicación.
	 *
	 * Cada conteo se consulta solo cuando el curso lo exige: uno que se completa
	 * por asistencia no mira sus lecciones, y uno de captura manual no mira su
	 * examen.
	 */
	const contentFactsOf = async (course: {
		id: number;
		format: CourseFormat;
		completionRule: CourseCompletionRule;
		requiresEvaluation: boolean;
		evaluationMethod: EvaluationMethod;
	}): Promise<CourseContentFacts> => {
		const [lessonCount, finalQuizQuestionCount] = await Promise.all([
			requiresContent(course)
				? contentRepository.countActiveLessons(course.id)
				: 0,
			evaluatesByQuiz(course)
				? contentRepository.countFinalQuizQuestions(course.id)
				: 0,
		]);

		return { lessonCount, finalQuizQuestionCount };
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

	/** Avisa a inscritos e invitados pendientes, dentro de la transacción en curso. */
	const notifyEnrolled = async (
		courseId: number,
		eventOf: (to: NotifiableParticipant) => NotificationEvent,
	) => {
		const recipients =
			await enrollmentRepository.findNotifiableRecipients(courseId);
		if (recipients.length > 0) {
			await notificationService.notify(recipients.map(eventOf));
		}
	};

	/**
	 * La línea del plan que el curso va a ocupar, con su fila bloqueada: dos
	 * altas simultáneas sobre la misma línea no pueden pasar las dos la
	 * comprobación de que no tiene curso activo (docs/adr/0007).
	 */
	const claimPlanLine = async (
		lineDocumentId: string,
		dependencyId: number,
	): Promise<number> => {
		const line = await annualPlanRepository.lockLineForCourse(lineDocumentId);
		if (!line || line.plan.dependencyId !== dependencyId) {
			throw new CoursePlanLineNotFoundError();
		}
		assertLineAvailableForCourse(line, line.plan, clock.now());

		return line.id;
	};

	/**
	 * Del formulario a lo que el repositorio escribe.
	 *
	 * Aquí muere la hora de pared: a partir de este punto todo son instantes UTC
	 * y ninguna capa vuelve a hablar de zonas horarias. Aquí también se rechazan
	 * los lotes incompletos, como hace el alta de miembros de un grupo: asignar
	 * solo lo válido dejaría un curso silenciosamente distinto del que se pidió.
	 */
	/** El método que se escribirá, con los mismos defaults que `buildWriteData`. */
	const evaluationMethodOf = (dto: CreateCourseDto | UpdateCourseDto) =>
		resolveEvaluationMethod({
			format: dto.format ?? COURSE_DEFAULTS.format,
			requiresEvaluation: dto.requiresEvaluation ?? false,
			evaluationMethod:
				dto.evaluationMethod ?? COURSE_DEFAULTS.evaluationMethod,
		});

	const buildWriteData = async (
		dto: CreateCourseDto | UpdateCourseDto,
		scope: CourseScope,
	): Promise<CourseWriteData> => {
		const format = dto.format ?? COURSE_DEFAULTS.format;
		const completionRule = dto.completionRule ?? COURSE_DEFAULTS.completionRule;
		const requiresEvaluation = dto.requiresEvaluation ?? false;

		assertCompletionRuleCoherent({ format, completionRule });
		const evaluationMethod = evaluationMethodOf(dto);

		// Un autogestivo no se reúne: las sesiones que el formulario haya dejado
		// atrás se descartan aquí, y su modalidad deja de tener a qué referirse.
		const scheduled = requiresSessions(format);
		const inputSessions = scheduled ? dto.sessions : [];

		assertSessionLimit(inputSessions.length);

		const sessions: CourseSessionData[] = inputSessions
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
		// Igual que las sesiones: un autogestivo no tiene quién lo imparta.
		const trainerDocumentIds = requiresTrainer(format)
			? unique(dto.trainers)
			: [];

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
			hours: dto.hours ?? null,
			modality: scheduled ? dto.modality : "ONLINE",
			format,
			completionRule,
			access: dto.access,
			capacity: dto.capacity ?? null,
			enrollmentDeadline,
			minAttendance: dto.minAttendance ?? COURSE_DEFAULTS.minAttendance,
			requiresEvaluation,
			evaluationMethod,
			qrOpensBeforeMinutes:
				dto.qrOpensBeforeMinutes ?? COURSE_DEFAULTS.qrOpensBeforeMinutes,
			qrClosesAfterMinutes:
				dto.qrClosesAfterMinutes ?? COURSE_DEFAULTS.qrClosesAfterMinutes,
			sessions,
			trainerIds: trainers.map((trainer) => trainer.id),
			audienceDependencyIds: dependencies.map((entry) => entry.id),
			audienceGroupIds: groups.map((entry) => entry.id),
		};
	};

	// ===============================================================
	// Portada
	// ===============================================================

	/**
	 * Dependencias de la transacción de storage, armadas una vez.
	 *
	 * El bucket lo decide la key, no este módulo: `media/` resuelve al bucket
	 * público cuando existe, y pasar por la política deja la subida correcta
	 * aunque mañana cambien los prefijos.
	 */
	const coverTxDeps = (): StorageTxDeps => {
		// Error de configuración, no de negocio: sale como UNEXPECTED y se
		// registra con su mensaje real, que es lo que necesita quien opera.
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		return {
			provider: storageProvider,
			logger: log,
			buckets: {
				defaultBucket: storageBucket,
				publicBucket: storagePublicBucket,
			},
			validation: {
				allowedTypes: COURSE_COVER.allowedTypes,
				maxBytes: COURSE_COVER.maxBytes,
				maxCount: 1,
			},
		};
	};

	/**
	 * Valida la portada ANTES de entrar a la transacción.
	 *
	 * La transacción vuelve a validar, pero su `StorageValidationError` no es un
	 * `DomainError`: llegaría al cliente como error inesperado en vez de decir
	 * qué tiene de malo el archivo.
	 */
	const assertValidCover = (cover: UploadInput) => {
		const reason = validateUploadInput(cover, {
			allowedTypes: COURSE_COVER.allowedTypes,
			maxBytes: COURSE_COVER.maxBytes,
		});
		if (reason) throw new CourseCoverInvalidError(reason);
	};

	/**
	 * Borra la portada anterior, best-effort y DESPUÉS del commit.
	 *
	 * Un objeto que ya no está no puede tumbar un guardado que ya ocurrió; si el
	 * borrado falla queda un huérfano, que el gestor de nube sabe detectar.
	 */
	const discardCover = (previous: string | null) => {
		if (!previous || !storageBucket) return;

		const key = getKeyFromUrl(previous);
		if (!key) return;

		void storageProvider
			.deleteFile(
				bucketForKey(key, {
					defaultBucket: storageBucket,
					publicBucket: storagePublicBucket,
				}),
				key,
			)
			.catch((error) => {
				log.warn("[courses] portada anterior no borrada", { key, error });
			});
	};

	/**
	 * Ejecuta la escritura con la portada dentro de la MISMA unidad de trabajo.
	 *
	 * La transacción de storage envuelve a la de base: si la fila falla —por el
	 * cupo, por el alcance, por lo que sea— el objeto recién subido se borra y
	 * no queda una portada sin curso.
	 */
	const withCover = async <T>(
		cover: UploadInput | null | undefined,
		write: (coverImageUrl: string | null) => Promise<T>,
	): Promise<T> => {
		if (!cover) return write(null);

		assertValidCover(cover);

		return withStorageTransaction(coverTxDeps(), async (tx) => {
			const uploaded = await tx.upload(COURSE_COVER.prefix, cover);
			return write(uploaded.url);
		});
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
		async create(
			dto: CreateCourseDto,
			actor: AuthContext,
			cover?: UploadInput | null,
		) {
			return run("create", async () => {
				const scope = requireWriteScope(actor);
				const dependencyId = await resolveOrganizer(dto.dependency, scope);
				const data = await buildWriteData(dto, scope);

				// Curso, sesiones, capacitadores y audiencia son una sola escritura
				// (reglas §8.1): un curso a medias no es un borrador, es basura. La
				// portada entra en esa misma unidad, una capa más afuera.
				return ok(
					await withCover(cover, (coverImageUrl) =>
						runInTransaction(async () =>
							courseRepository.create({
								...data,
								coverImageUrl,
								dependencyId,
								createdById: actor.userId,
								planLineId: dto.planLine
									? await claimPlanLine(dto.planLine, dependencyId)
									: null,
							}),
						),
					),
				);
			});
		},
		async update(
			documentId: string,
			dto: UpdateCourseDto,
			actor: AuthContext,
			cover?: UploadInput | null,
		) {
			return run("update", async () => {
				const scope = requireWriteScope(actor);
				const course = await requireCourse(documentId, scope);

				if (!canEdit(course.status)) {
					throw new CourseNotEditableError(course.status);
				}

				assertFormatEditable(
					course.status,
					(dto.format ?? course.format) !== course.format,
				);
				// Con los mismos defaults que `buildWriteData`: se compara lo que se
				// va a escribir, no lo que llegó.
				assertCompletionSettingsEditable(course, {
					completionRule: dto.completionRule ?? COURSE_DEFAULTS.completionRule,
					requiresEvaluation: dto.requiresEvaluation ?? false,
					evaluationMethod: evaluationMethodOf(dto),
				});

				const data = await buildWriteData(dto, scope);
				// Tres estados, no dos: archivo nuevo sustituye, `removeCover` quita,
				// y no mandar nada conserva la que ya tenía.
				const replaces = Boolean(cover) || dto.removeCover === true;

				const updated = await withCover(cover, (coverImageUrl) =>
					runInTransaction(async () => {
						const { enrolled } = await enrollmentRepository.lockCourseSeats(
							course.id,
						);
						assertCapacityCovers(data.capacity, enrolled);

						const saved = await courseRepository.update(
							documentId,
							{ ...data, ...(replaces && { coverImageUrl }) },
							scope,
						);
						if (
							course.status === "PUBLISHED" &&
							hasScheduleChanges(course.sessions, data.sessions)
						) {
							await notifyEnrolled(course.id, (to) => ({
								template: "COURSE_UPDATED",
								to,
								course: toNotifiedCourse(saved),
								sessions: toNotifiedSessions(saved.sessions),
							}));
						}

						return saved;
					}),
				);

				// Fuera de las dos transacciones a propósito: el objeto viejo ya no lo
				// referencia nadie, y su borrado no puede revertir lo ya guardado.
				if (replaces) discardCover(course.coverImageUrl);

				return ok(updated);
			});
		},
		async publish(documentId: string, actor: AuthContext) {
			return run("publish", async () => {
				const scope = requireWriteScope(actor);
				const course = await requireCourse(documentId, scope);

				// Falla con el código de la condición que faltó, no con uno genérico:
				// es lo que permite decir QUÉ sesión se quedó sin sede.
				assertPublishable(course, await contentFactsOf(course));

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

				return ok(
					await runInTransaction(async () => {
						const cancelled = await courseRepository.cancel(documentId, scope);
						// Un borrador no tiene inscritos ni invitados a quienes avisar.
						if (course.status === "PUBLISHED") {
							await notifyEnrolled(course.id, (to) => ({
								template: "COURSE_CANCELLED",
								to,
								course: toNotifiedCourse(course),
							}));
						}
						return cancelled;
					}),
				);
			});
		},
	};
};
