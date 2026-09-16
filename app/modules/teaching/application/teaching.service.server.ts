import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { diffCredits } from "@/modules/credits/domain/credit.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	canTeach,
	resolveTeachingScope,
	type TeachingScope,
	teachingCourseWhere,
} from "../domain/teaching.access";
import { TEACHING_LIST_DEFAULTS } from "../domain/teaching.config";
import {
	TeachingCourseNotFoundError,
	TeachingForbiddenScopeError,
	TeachingSessionNotFoundError,
	TeachingSessionNotStartedError,
	TeachingStateChangedError,
} from "../domain/teaching.errors";
import { toTeachingDetail } from "../domain/teaching.mapper";
import {
	assertFinishable,
	assertWritable,
	completedParticipantsOf,
	creditCandidatesOf,
	fiscalYearOf,
	isSessionOpen,
	resolveAttendanceMarks,
	resolveResultEntries,
	sessionOpensAt,
} from "../domain/teaching.rules";
import type { ITeachingService } from "../domain/teaching.service";
import type {
	ListTeachingCoursesDto,
	SaveAttendanceDto,
	SaveResultsDto,
	TeachingCourse,
} from "../domain/teaching.types";

type Dependencies = {
	teachingRepository: ICradle["teachingRepository"];
	courseRepository: ICradle["courseRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	creditRepository: ICradle["creditRepository"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createTeachingService = ({
	teachingRepository,
	courseRepository,
	enrollmentRepository,
	creditRepository,
	runInTransaction,
	clock,
	logger,
}: Dependencies): ITeachingService => {
	const run = createOperationRunner(logger.child({ module: "teaching" }));

	const requireScope = (actor: AuthContext): TeachingScope => {
		const scope = resolveTeachingScope(actor);
		if (!canTeach(scope)) throw new TeachingForbiddenScopeError();
		return scope;
	};

	const requireCourse = async (
		documentId: string,
		scope: TeachingScope,
	): Promise<TeachingCourse> => {
		const course = await teachingRepository.findCourse(
			documentId,
			teachingCourseWhere(scope),
		);
		if (!course) throw new TeachingCourseNotFoundError();
		return course;
	};

	/**
	 * Bloquea la fila del curso y la vuelve a leer. Con el bloqueo, dos
	 * correcciones simultáneas no pueden calcular créditos sobre datos viejos, y
	 * nadie escribe asistencia en un curso que otra petición acaba de finalizar.
	 * Reutiliza el bloqueo del cupo de PRD-04: es el mismo `FOR UPDATE`.
	 */
	const lockCourse = async (courseId: number): Promise<TeachingCourse> => {
		await enrollmentRepository.lockCourseSeats(courseId);
		return teachingRepository.findCourseById(courseId);
	};

	/**
	 * Recalcula quién completó y deja los créditos igual que el cálculo.
	 *
	 * Lo llaman el cierre y cada corrección. Lee después de escribir para que el
	 * cálculo vea lo que se acaba de guardar.
	 */
	const syncCompletion = async (
		courseId: number,
		actorId: number,
		at: Date,
	) => {
		const course = await teachingRepository.findCourseById(courseId);
		const completed = completedParticipantsOf(course);

		await enrollmentRepository.setCompletion(
			course.id,
			completed.map((participant) => participant.userId),
		);

		const diff = diffCredits(
			await creditRepository.findByCourse(course.id),
			creditCandidatesOf(completed),
		);
		const context = {
			courseId: course.id,
			fiscalYear: fiscalYearOf(course, at),
			at,
			actorId,
		};

		await creditRepository.grant(diff.grant, context);
		await creditRepository.restore(diff.restore, context);
		await creditRepository.revoke(diff.revoke, context);

		return { completed: completed.length, diff };
	};

	return {
		async listCourses(filters: ListTeachingCoursesDto, actor: AuthContext) {
			return run("listCourses", async () => {
				const where = teachingCourseWhere(requireScope(actor));

				const [courses, total] = await Promise.all([
					teachingRepository.findCourses(filters, where),
					teachingRepository.countCourses(filters, where),
				]);

				return ok(courses, {
					pagination: toPaginationMeta({
						page: filters.page ?? TEACHING_LIST_DEFAULTS.page,
						pageSize: filters.pageSize ?? TEACHING_LIST_DEFAULTS.pageSize,
						total,
					}),
				});
			});
		},

		async findById(documentId: string, actor: AuthContext) {
			return run("findById", async () => {
				const scope = requireScope(actor);
				const course = await requireCourse(documentId, scope);

				return ok(toTeachingDetail(course, scope, clock.now()));
			});
		},

		async saveAttendance(
			documentId: string,
			dto: SaveAttendanceDto,
			actor: AuthContext,
		) {
			return run("saveAttendance", async () => {
				const scope = requireScope(actor);
				const { id } = await requireCourse(documentId, scope);
				const now = clock.now();

				const affected = await runInTransaction(async () => {
					const course = await lockCourse(id);
					assertWritable(course, scope);

					const session = course.sessions.find(
						(row) => row.documentId === dto.sessionDocumentId,
					);
					if (!session) throw new TeachingSessionNotFoundError();
					if (course.status === "PUBLISHED" && !isSessionOpen(session, now)) {
						throw new TeachingSessionNotStartedError(sessionOpensAt(session));
					}

					const marks = resolveAttendanceMarks(course, session.id, dto.marks);
					if (marks.length === 0) return 0;

					await teachingRepository.saveAttendance(
						session.id,
						marks,
						actor.userId,
						now,
					);
					if (course.status === "FINISHED") {
						await syncCompletion(course.id, actor.userId, now);
					}

					return marks.length;
				});

				return ok({ affected });
			});
		},

		async saveResults(
			documentId: string,
			dto: SaveResultsDto,
			actor: AuthContext,
		) {
			return run("saveResults", async () => {
				const scope = requireScope(actor);
				const { id } = await requireCourse(documentId, scope);
				const now = clock.now();

				const affected = await runInTransaction(async () => {
					const course = await lockCourse(id);
					assertWritable(course, scope);

					const entries = resolveResultEntries(course, dto.entries);
					if (entries.length === 0) return 0;

					await enrollmentRepository.saveResults(
						course.id,
						entries,
						actor.userId,
						now,
					);
					if (course.status === "FINISHED") {
						await syncCompletion(course.id, actor.userId, now);
					}

					return entries.length;
				});

				return ok({ affected });
			});
		},

		async finish(documentId: string, actor: AuthContext) {
			return run("finish", async () => {
				const scope = requireScope(actor);
				const { id } = await requireCourse(documentId, scope);
				const now = clock.now();

				const summary = await runInTransaction(async () => {
					const course = await lockCourse(id);
					assertFinishable(course, now);

					if (!(await courseRepository.finish(course.id, now))) {
						throw new TeachingStateChangedError();
					}

					// PRD-07 marca aquí como `realizada` la línea del plan vinculada (§6.11).
					return syncCompletion(course.id, actor.userId, now);
				});

				return ok({
					completed: summary.completed,
					credits: summary.diff.grant.length + summary.diff.restore.length,
				});
			});
		},
	};
};
