import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	administersCourse,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import { evaluatesByQuiz } from "@/modules/courses/domain/course.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	canTeach,
	ownTeachingScope,
	resolveTeachingScope,
	type TeachingScope,
	teachingCourseWhere,
} from "../domain/teaching.access";
import {
	TEACHING_LIST_DEFAULTS,
	TEACHING_PENDING_SCAN_CAP,
} from "../domain/teaching.config";
import {
	TeachingCourseNotFoundError,
	TeachingForbiddenScopeError,
	TeachingSessionNotFoundError,
	TeachingSessionNotStartedError,
	TeachingStateChangedError,
} from "../domain/teaching.errors";
import { toTeachingDetail } from "../domain/teaching.mapper";
import {
	assertCertificatesIssuable,
	assertEnrollmentTogglable,
	assertFinishable,
	assertWritable,
	isSessionOpen,
	resolveAttendanceMarks,
	sessionOpensAt,
	syncsOnWrite,
} from "../domain/teaching.rules";
import type { ITeachingService } from "../domain/teaching.service";
import type {
	ListTeachingCoursesDto,
	SaveAttendanceDto,
	SetEnrollmentOpenDto,
	TeachingCourse,
} from "../domain/teaching.types";
import { toTeachingPending } from "../domain/teaching-pending.rules";

type Dependencies = {
	teachingRepository: ICradle["teachingRepository"];
	courseRepository: ICradle["courseRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	completionSync: ICradle["completionSync"];
	progressSync: ICradle["progressSync"];
	runInTransaction: ICradle["runInTransaction"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createTeachingService = ({
	teachingRepository,
	courseRepository,
	enrollmentRepository,
	completionSync,
	progressSync,
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
	 * Solo el id, con el mismo filtro que `requireCourse`: quien escribe lo
	 * bloquea y lo vuelve a leer completo dentro de la transacción.
	 */
	const requireCourseId = async (
		documentId: string,
		scope: TeachingScope,
	): Promise<number> => {
		const id = await teachingRepository.findCourseId(
			documentId,
			teachingCourseWhere(scope),
		);
		if (id === null) throw new TeachingCourseNotFoundError();
		return id;
	};

	/**
	 * Bloquea la fila del curso y la vuelve a leer. Con el bloqueo, dos
	 * correcciones simultáneas no pueden calcular créditos sobre datos viejos, y
	 * nadie escribe asistencia en un curso que otra petición acaba de finalizar.
	 * Reutiliza el bloqueo del cupo de PRD-04: es el mismo `FOR UPDATE`.
	 */
	const lockCourse = async (courseId: number): Promise<TeachingCourse> => {
		await enrollmentRepository.lockCourse(courseId);
		return teachingRepository.findCourseById(courseId);
	};

	return {
		async summarizePending(actor: AuthContext, { limit }: { limit: number }) {
			return run("summarizePending", async () => {
				const scope = ownTeachingScope(actor);
				if (!canTeach(scope)) throw new TeachingForbiddenScopeError();

				const records = await teachingRepository.findAwaitingFinish(
					teachingCourseWhere(scope),
					{
						now: clock.now(),
						viewerId: actor.userId,
						take: TEACHING_PENDING_SCAN_CAP,
					},
				);

				return ok(toTeachingPending(records, scope, limit));
			});
		},

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

				return ok(
					toTeachingDetail(
						course,
						scope,
						clock.now(),
						administersCourse(resolveCourseScope(actor), course),
					),
				);
			});
		},

		async saveAttendance(
			documentId: string,
			dto: SaveAttendanceDto,
			actor: AuthContext,
		) {
			return run("saveAttendance", async () => {
				const scope = requireScope(actor);
				const id = await requireCourseId(documentId, scope);
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
					if (syncsOnWrite(course)) {
						await completionSync.sync(course.id, actor.userId, now);
					}

					return marks.length;
				});

				return ok({ affected });
			});
		},

		async finish(documentId: string, actor: AuthContext) {
			return run("finish", async () => {
				const scope = requireScope(actor);
				const id = await requireCourseId(documentId, scope);
				const now = clock.now();

				const summary = await runInTransaction(async () => {
					const course = await lockCourse(id);
					assertFinishable(course, now);

					if (!(await courseRepository.finish(course.id, now))) {
						throw new TeachingStateChangedError();
					}
					// Al cerrar, todo seguimiento cierra: quien no presentó uno que
					// cuenta saca 0, y la nota se recalcula con él (docs/adr/0027).
					await progressSync.recalculate(course, actor.userId, now, undefined, {
						closing: true,
					});
					// Quien no presentó el examen no tiene resultado: al cerrar queda
					// reprobado, que es lo que la pantalla enseña como «No presentó».
					if (evaluatesByQuiz(course)) {
						await enrollmentRepository.markPendingAsFailed(
							course.id,
							actor.userId,
							now,
						);
					}

					return completionSync.sync(course.id, actor.userId, now);
				});

				return ok({
					completed: summary.completed,
					credits: summary.diff.grant.length + summary.diff.restore.length,
					certificates:
						summary.certificates.issued + summary.certificates.restored,
				});
			});
		},

		async issueCertificates(documentId: string, actor: AuthContext) {
			return run("issueCertificates", async () => {
				const scope = requireScope(actor);
				const id = await requireCourseId(documentId, scope);
				const now = clock.now();

				const summary = await runInTransaction(async () => {
					const course = await lockCourse(id);
					assertCertificatesIssuable(course);
					assertWritable(course, scope);

					return completionSync.sync(course.id, actor.userId, now);
				});

				return ok({ issued: summary.certificates.issued });
			});
		},

		async setEnrollmentOpen(
			documentId: string,
			dto: SetEnrollmentOpenDto,
			actor: AuthContext,
		) {
			return run("setEnrollmentOpen", async () => {
				const scope = requireScope(actor);
				const id = await requireCourseId(documentId, scope);
				const now = clock.now();

				const affected = await runInTransaction(async () => {
					const course = await lockCourse(id);
					assertEnrollmentTogglable(course);

					const closed = course.enrollmentClosedAt !== null;
					if (closed === !dto.open) return 0;

					await courseRepository.setEnrollmentClosed(
						course.id,
						dto.open ? null : now,
					);
					return 1;
				});

				return ok({ affected });
			});
		},
	};
};
