import type { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import type { EvaluationRaw } from "../domain/evaluation.mapper";
import type {
	EvaluationCourseWhere,
	IEvaluationRepository,
} from "../domain/evaluation.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

/** El filtro de dominio usa arreglos `readonly`, que Prisma no acepta tal cual. */
const asCourseWhere = (where: EvaluationCourseWhere) =>
	where as unknown as Prisma.CourseWhereInput;

const EVALUATION_SELECT = {
	documentId: true,
	title: true,
	session: { select: { documentId: true } },
	results: {
		select: {
			passed: true,
			note: true,
			user: { select: { documentId: true } },
		},
	},
} satisfies Prisma.CourseEvaluationSelect;

export const createEvaluationRepository = ({
	prisma,
}: Dependencies): IEvaluationRepository => ({
	async findCourse(courseDocumentId, where) {
		const course = await prisma.course.findFirst({
			where: { AND: [{ documentId: courseDocumentId }, asCourseWhere(where)] },
			select: {
				id: true,
				status: true,
				dependencyId: true,
				_count: { select: { evaluations: true } },
			},
		});
		if (!course) return null;

		return {
			id: course.id,
			status: course.status,
			dependencyId: course.dependencyId,
			evaluationCount: course._count.evaluations,
		};
	},

	async findBoard(courseId): Promise<EvaluationRaw[]> {
		return prisma.courseEvaluation.findMany({
			where: { courseId },
			orderBy: { createdAt: "asc" },
			select: EVALUATION_SELECT,
		});
	},

	async findTarget(courseDocumentId, evaluationDocumentId, where) {
		const evaluation = await prisma.courseEvaluation.findFirst({
			where: {
				documentId: evaluationDocumentId,
				course: {
					AND: [{ documentId: courseDocumentId }, asCourseWhere(where)],
				},
			},
			select: {
				id: true,
				course: {
					select: {
						id: true,
						status: true,
						dependencyId: true,
						enrollments: {
							where: { status: "ENROLLED" },
							select: { userId: true, user: { select: { documentId: true } } },
						},
					},
				},
				results: { select: { userId: true, passed: true, note: true } },
			},
		});
		if (!evaluation) return null;

		return {
			id: evaluation.id,
			course: {
				id: evaluation.course.id,
				status: evaluation.course.status,
				dependencyId: evaluation.course.dependencyId,
			},
			participants: evaluation.course.enrollments.map((enrollment) => ({
				userId: enrollment.userId,
				userDocumentId: enrollment.user.documentId,
			})),
			results: evaluation.results,
		};
	},

	async findSessionId(courseId, sessionDocumentId) {
		const session = await prisma.courseSession.findFirst({
			where: { courseId, documentId: sessionDocumentId },
			select: { id: true },
		});

		return session?.id ?? null;
	},

	async create(data) {
		await prisma.courseEvaluation.create({ data });
	},

	async update(evaluationId, data) {
		await prisma.courseEvaluation.update({ where: { id: evaluationId }, data });
	},

	async remove(evaluationId) {
		await prisma.courseEvaluation.delete({ where: { id: evaluationId } });
	},

	async saveResults(evaluationId, writes, deletes, actorId, at) {
		// Secuencial: la transacción interactiva de Prisma no admite consultas en paralelo.
		for (const write of writes) {
			const data = {
				passed: write.passed,
				note: write.note,
				recordedById: actorId,
				recordedAt: at,
			} satisfies Prisma.EvaluationResultUncheckedUpdateInput;

			await prisma.evaluationResult.upsert({
				where: {
					evaluationId_userId: { evaluationId, userId: write.userId },
				},
				create: { evaluationId, userId: write.userId, ...data },
				update: data,
			});
		}

		if (deletes.length > 0) {
			await prisma.evaluationResult.deleteMany({
				where: { evaluationId, userId: { in: [...deletes] } },
			});
		}
	},
});
