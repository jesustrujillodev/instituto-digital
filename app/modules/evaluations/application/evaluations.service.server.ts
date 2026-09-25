import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	courseScopeWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import { canEdit } from "@/modules/courses/domain/course.rules";
import {
	canTeach,
	resolveTeachingScope,
	type TeachingScope,
	teachingCourseWhere,
} from "@/modules/teaching/domain/teaching.access";
import { canWrite } from "@/modules/teaching/domain/teaching.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { EVALUATIONS_PER_COURSE_LIMIT } from "../domain/evaluation.config";
import {
	EvaluationCourseNotFoundError,
	EvaluationForbiddenError,
	EvaluationNotFoundError,
	EvaluationSessionNotFoundError,
	EvaluationTooManyError,
} from "../domain/evaluation.errors";
import { toEvaluationBoard } from "../domain/evaluation.mapper";
import type { EvaluationCourseWhere } from "../domain/evaluation.repository";
import {
	assertFollowUpsAllowed,
	resolveCaptureWrites,
} from "../domain/evaluation.rules";
import type { IEvaluationService } from "../domain/evaluation.service";
import type {
	EvaluationCourseRef,
	SaveEvaluationDto,
	SaveEvaluationResultsDto,
} from "../domain/evaluation.types";

type Dependencies = {
	evaluationRepository: ICradle["evaluationRepository"];
	runInTransaction: ICradle["runInTransaction"];
	logger: ICradle["logger"];
};

/**
 * Las evaluaciones de seguimiento tienen dos momentos con dos alcances: se
 * DEFINEN al crear o editar el curso, con el alcance de quien lo administra, y
 * sus resultados se CAPTURAN al impartirlo, con el de quien lo imparte.
 */
export const createEvaluationService = ({
	evaluationRepository,
	runInTransaction,
	logger,
}: Dependencies): IEvaluationService => {
	const run = createOperationRunner(logger.child({ module: "evaluations" }));

	/** El alcance de imparticion; sin el, ni siquiera se busca el curso. */
	const scopeOf = (actor: AuthContext): TeachingScope => {
		const scope = resolveTeachingScope(actor);
		if (!canTeach(scope)) throw new EvaluationCourseNotFoundError();
		return scope;
	};

	/** El alcance de administracion de cursos: el capacitador que solo imparte no define. */
	const definitionWhereOf = (actor: AuthContext): EvaluationCourseWhere => {
		const scope = resolveCourseScope(actor);
		if (scope.kind === "none") throw new EvaluationCourseNotFoundError();
		return courseScopeWhere(scope);
	};

	const requireCourse = async (
		courseDocumentId: string,
		where: EvaluationCourseWhere,
	) => {
		const course = await evaluationRepository.findCourse(
			courseDocumentId,
			where,
		);
		if (!course) throw new EvaluationCourseNotFoundError();
		return course;
	};

	/** Se definen mientras el curso se puede editar: borrador o publicado. */
	const assertDefinable = (course: EvaluationCourseRef) => {
		if (!canEdit(course.status)) throw new EvaluationForbiddenError();
	};

	/**
	 * Publicado: quien lo imparte. Finalizado: solo quien corrige. Es la misma
	 * matriz que ya rige el resultado final, sin regla nueva.
	 */
	const assertWritable = (
		course: EvaluationCourseRef,
		scope: TeachingScope,
	) => {
		if (!canWrite(course, scope)) throw new EvaluationForbiddenError();
	};

	const resolveSessionId = async (
		courseId: number,
		sessionDocumentId: string | null,
	) => {
		if (sessionDocumentId === null) return null;

		const sessionId = await evaluationRepository.findSessionId(
			courseId,
			sessionDocumentId,
		);
		if (sessionId === null) throw new EvaluationSessionNotFoundError();
		return sessionId;
	};

	const requireTarget = async (
		courseDocumentId: string,
		evaluationDocumentId: string,
		where: EvaluationCourseWhere,
	) => {
		const target = await evaluationRepository.findTarget(
			courseDocumentId,
			evaluationDocumentId,
			where,
		);
		if (!target) throw new EvaluationNotFoundError();
		return target;
	};

	return {
		async findCourseBoard(courseDocumentId: string, actor: AuthContext) {
			return run("findCourseBoard", async () => {
				const scope = scopeOf(actor);
				const course = await requireCourse(
					courseDocumentId,
					teachingCourseWhere(scope),
				);

				return ok(
					toEvaluationBoard(
						await evaluationRepository.findBoard(course.id),
						canWrite(course, scope),
					),
				);
			});
		},

		async findDefinitions(courseDocumentId: string, actor: AuthContext) {
			return run("findDefinitions", async () => {
				const course = await requireCourse(
					courseDocumentId,
					definitionWhereOf(actor),
				);

				return ok(
					toEvaluationBoard(
						await evaluationRepository.findBoard(course.id),
						canEdit(course.status),
					).evaluations,
				);
			});
		},

		async create(
			courseDocumentId: string,
			dto: SaveEvaluationDto,
			actor: AuthContext,
		) {
			return run("create", async () => {
				const course = await requireCourse(
					courseDocumentId,
					definitionWhereOf(actor),
				);
				assertDefinable(course);
				assertFollowUpsAllowed(course.format);

				if (course.evaluationCount >= EVALUATIONS_PER_COURSE_LIMIT) {
					throw new EvaluationTooManyError(EVALUATIONS_PER_COURSE_LIMIT);
				}

				await evaluationRepository.create({
					courseId: course.id,
					sessionId: await resolveSessionId(course.id, dto.sessionDocumentId),
					title: dto.title,
					createdById: actor.userId,
				});

				return ok(null);
			});
		},

		async update(
			courseDocumentId: string,
			evaluationDocumentId: string,
			dto: SaveEvaluationDto,
			actor: AuthContext,
		) {
			return run("update", async () => {
				const target = await requireTarget(
					courseDocumentId,
					evaluationDocumentId,
					definitionWhereOf(actor),
				);
				assertDefinable(target.course);

				await evaluationRepository.update(target.id, {
					title: dto.title,
					sessionId: await resolveSessionId(
						target.course.id,
						dto.sessionDocumentId,
					),
				});

				return ok(null);
			});
		},

		async remove(
			courseDocumentId: string,
			evaluationDocumentId: string,
			actor: AuthContext,
		) {
			return run("remove", async () => {
				const target = await requireTarget(
					courseDocumentId,
					evaluationDocumentId,
					definitionWhereOf(actor),
				);
				assertDefinable(target.course);

				await evaluationRepository.remove(target.id);

				return ok(null);
			});
		},

		async saveResults(
			courseDocumentId: string,
			dto: SaveEvaluationResultsDto,
			actor: AuthContext,
		) {
			return run("saveResults", async () => {
				const scope = scopeOf(actor);
				const target = await requireTarget(
					courseDocumentId,
					dto.evaluationDocumentId,
					teachingCourseWhere(scope),
				);
				assertWritable(target.course, scope);

				const { writes, deletes } = resolveCaptureWrites(target, dto.entries);
				const affected = writes.length + deletes.length;
				if (affected === 0) return ok({ affected });

				// Altas, cambios y bajas son un solo envio: o entra entero o no entra.
				await runInTransaction(() =>
					evaluationRepository.saveResults(
						target.id,
						writes,
						deletes,
						actor.userId,
						new Date(),
					),
				);

				return ok({ affected });
			});
		},
	};
};
