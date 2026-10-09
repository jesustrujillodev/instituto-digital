import { Prisma } from "@prisma/client";
import type { CourseScopeWriteWhere } from "@/modules/courses/domain/course.access";
import type { ICradle } from "@/shared/di/container.types";
import type { ContentModuleRaw } from "../domain/content.mapper";
import type { IContentRepository } from "../domain/content.repository";
import type { LessonBody } from "../domain/content.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const asCourseWhere = (where: CourseScopeWriteWhere) =>
	where as unknown as Prisma.CourseWhereInput;

const ACTIVE = { archivedAt: null } as const;

/**
 * El árbol del cuerpo, listo para la columna `Json`.
 *
 * Nulo significa "sin cuerpo", no "JSON null": va con el centinela de Prisma
 * para que la columna quede NULL de verdad.
 */
const asJson = (body: LessonBody | null) =>
	body ? (body as unknown as Prisma.InputJsonObject) : Prisma.DbNull;

const MODULE_SELECT = {
	documentId: true,
	title: true,
	description: true,
	order: true,
	lessons: {
		where: ACTIVE,
		orderBy: { order: "asc" },
		select: {
			documentId: true,
			title: true,
			type: true,
			order: true,
			isRequired: true,
			estimatedMinutes: true,
			content: { select: { fileUrl: true, externalUrl: true } },
			quiz: { select: { _count: { select: { questions: true } } } },
		},
	},
	// A lo sumo uno activo por módulo: lo impone el servicio.
	quizzes: {
		where: ACTIVE,
		take: 1,
		select: {
			documentId: true,
			title: true,
			maxAttempts: true,
			_count: { select: { questions: true } },
		},
	},
} satisfies Prisma.CourseModuleSelect;

const MATERIAL_SELECT = {
	documentId: true,
	title: true,
	type: true,
	content: {
		select: {
			body: true,
			fileUrl: true,
			fileName: true,
			fileSize: true,
			mimeType: true,
			externalUrl: true,
		},
	},
} satisfies Prisma.LessonSelect;

const ORDERED_SELECT = {
	documentId: true,
	order: true,
} satisfies Prisma.CourseModuleSelect & Prisma.LessonSelect;

export const createContentRepository = ({
	prisma,
}: Dependencies): IContentRepository => {
	/** Escribe el orden fila a fila: la transacción de Prisma no va en paralelo. */
	const writeModuleOrder = async (
		writes: readonly { documentId: string; order: number }[],
	) => {
		for (const write of writes) {
			await prisma.courseModule.update({
				where: { documentId: write.documentId },
				data: { order: write.order },
			});
		}
	};

	const writeLessonOrder = async (
		writes: readonly { documentId: string; order: number }[],
	) => {
		for (const write of writes) {
			await prisma.lesson.update({
				where: { documentId: write.documentId },
				data: { order: write.order },
			});
		}
	};

	return {
		async findCourse(courseDocumentId, where) {
			return prisma.course.findFirst({
				where: {
					AND: [{ documentId: courseDocumentId }, asCourseWhere(where)],
				},
				select: {
					id: true,
					status: true,
					format: true,
					completionRule: true,
					requiresEvaluation: true,
					minPassingGrade: true,
				},
			});
		},

		async findCourseRef(courseId) {
			return prisma.course.findUnique({
				where: { id: courseId },
				select: {
					id: true,
					status: true,
					format: true,
					completionRule: true,
					requiresEvaluation: true,
					minPassingGrade: true,
				},
			});
		},

		async findTree(courseId): Promise<ContentModuleRaw[]> {
			return prisma.courseModule.findMany({
				where: { courseId, ...ACTIVE },
				orderBy: { order: "asc" },
				select: MODULE_SELECT,
			});
		},

		async findTrees(courseIds) {
			const trees = new Map<number, ContentModuleRaw[]>(
				courseIds.map((courseId) => [courseId, []]),
			);
			if (courseIds.length === 0) return trees;

			const rows = await prisma.courseModule.findMany({
				where: { courseId: { in: [...courseIds] }, ...ACTIVE },
				orderBy: { order: "asc" },
				select: { courseId: true, ...MODULE_SELECT },
			});
			for (const { courseId, ...module } of rows) {
				trees.get(courseId)?.push(module);
			}
			return trees;
		},

		async countFinalQuizQuestions(courseId) {
			return prisma.quizQuestion.count({
				where: {
					quiz: {
						courseId,
						lessonId: null,
						moduleId: null,
						sessionId: null,
						...ACTIVE,
					},
				},
			});
		},

		async countFollowUps(courseId) {
			const [withoutQuestions, counted] = await Promise.all([
				prisma.quiz.count({
					where: {
						courseId,
						sessionId: { not: null },
						questions: { none: {} },
					},
				}),
				prisma.quiz.count({
					where: {
						courseId,
						sessionId: { not: null },
						countsTowardGrade: true,
					},
				}),
			]);
			return { withoutQuestions, counted };
		},

		async findSessionsWithFollowUpAttempts(sessionDocumentIds) {
			const rows = await prisma.courseSession.findMany({
				where: {
					documentId: { in: [...sessionDocumentIds] },
					quizzes: { some: { attempts: { some: {} } } },
				},
				select: { documentId: true },
			});
			return rows.map((row) => row.documentId);
		},

		async countActiveLessons(courseId) {
			return prisma.lesson.count({
				where: { ...ACTIVE, module: { courseId, ...ACTIVE } },
			});
		},

		async findModuleSiblings(courseId) {
			return prisma.courseModule.findMany({
				where: { courseId, ...ACTIVE },
				orderBy: { order: "asc" },
				select: ORDERED_SELECT,
			});
		},

		async findLessonSiblings(moduleId) {
			return prisma.lesson.findMany({
				where: { moduleId, ...ACTIVE },
				orderBy: { order: "asc" },
				select: ORDERED_SELECT,
			});
		},

		async findModule(courseId, moduleDocumentId) {
			const module = await prisma.courseModule.findFirst({
				where: { courseId, documentId: moduleDocumentId, ...ACTIVE },
				select: {
					id: true,
					_count: {
						select: { lessons: { where: ACTIVE }, quizzes: { where: ACTIVE } },
					},
				},
			});
			if (!module) return null;

			return {
				id: module.id,
				activeLessons: module._count.lessons,
				hasActiveQuiz: module._count.quizzes > 0,
			};
		},

		async createModule(courseId, data) {
			return prisma.courseModule.create({
				data: { courseId, ...data },
				select: { documentId: true },
			});
		},

		async updateModule(moduleId, data) {
			await prisma.courseModule.update({ where: { id: moduleId }, data });
		},

		async deleteModule(moduleId, reorder) {
			await prisma.courseModule.delete({ where: { id: moduleId } });
			await writeModuleOrder(reorder);
		},

		async findLesson(courseId, lessonDocumentId) {
			return prisma.lesson.findFirst({
				where: {
					documentId: lessonDocumentId,
					...ACTIVE,
					module: { courseId, ...ACTIVE },
				},
				select: { id: true, moduleId: true, type: true, isRequired: true },
			});
		},

		async createLesson(moduleId, data) {
			return prisma.lesson.create({
				data: { moduleId, ...data },
				select: { documentId: true },
			});
		},

		async updateLesson(lessonId, data) {
			await prisma.lesson.update({ where: { id: lessonId }, data });
		},

		async deleteLesson(lessonId, reorder) {
			await prisma.lesson.delete({ where: { id: lessonId } });
			await writeLessonOrder(reorder);
		},

		async findMaterial(courseId, lessonDocumentId) {
			return prisma.lesson.findFirst({
				where: {
					documentId: lessonDocumentId,
					...ACTIVE,
					module: { courseId, ...ACTIVE },
				},
				select: MATERIAL_SELECT,
			});
		},

		async saveMaterial(lessonId, data) {
			await prisma.lessonContent.upsert({
				where: { lessonId },
				// `body` es JSON y nulo significa "sin cuerpo", no "JSON null": se
				// escribe con el centinela de Prisma para que la columna quede NULL.
				create: { lessonId, ...data, body: asJson(data.body) },
				update: { ...data, body: asJson(data.body) },
			});
		},

		async findMaterialFileUrl(lessonId) {
			const content = await prisma.lessonContent.findUnique({
				where: { lessonId },
				select: { fileUrl: true },
			});

			return content?.fileUrl ?? null;
		},

		async saveOrder(writes) {
			await writeModuleOrder(writes.modules);

			for (const write of writes.lessons) {
				await prisma.lesson.update({
					where: { documentId: write.documentId },
					data: {
						order: write.order,
						module: { connect: { documentId: write.moduleDocumentId } },
					},
				});
			}
		},
	};
};
