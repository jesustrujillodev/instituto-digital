import type { Prisma } from "@prisma/client";
import type { CourseScopeWriteWhere } from "@/modules/courses/domain/course.access";
import type { ICradle } from "@/shared/di/container.types";
import type { ContentModuleRaw } from "../domain/content.mapper";
import type { IContentRepository } from "../domain/content.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const asCourseWhere = (where: CourseScopeWriteWhere) =>
	where as unknown as Prisma.CourseWhereInput;

const ACTIVE = { archivedAt: null } as const;

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
		},
	},
} satisfies Prisma.CourseModuleSelect;

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
				select: { id: true, status: true, format: true },
			});
		},

		async findTree(courseId): Promise<ContentModuleRaw[]> {
			return prisma.courseModule.findMany({
				where: { courseId, ...ACTIVE },
				orderBy: { order: "asc" },
				select: MODULE_SELECT,
			});
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
					_count: { select: { lessons: { where: ACTIVE } } },
				},
			});
			if (!module) return null;

			return { id: module.id, activeLessons: module._count.lessons };
		},

		async createModule(courseId, data) {
			await prisma.courseModule.create({ data: { courseId, ...data } });
		},

		async updateModule(moduleId, data) {
			await prisma.courseModule.update({ where: { id: moduleId }, data });
		},

		async archiveModule(moduleId, at, reorder) {
			await prisma.courseModule.update({
				where: { id: moduleId },
				data: { archivedAt: at },
			});
			await writeModuleOrder(reorder);
		},

		async findLesson(courseId, lessonDocumentId) {
			return prisma.lesson.findFirst({
				where: {
					documentId: lessonDocumentId,
					...ACTIVE,
					module: { courseId, ...ACTIVE },
				},
				select: { id: true, moduleId: true },
			});
		},

		async createLesson(moduleId, data) {
			await prisma.lesson.create({ data: { moduleId, ...data } });
		},

		async updateLesson(lessonId, data) {
			await prisma.lesson.update({ where: { id: lessonId }, data });
		},

		async archiveLesson(lessonId, at, reorder) {
			await prisma.lesson.update({
				where: { id: lessonId },
				data: { archivedAt: at },
			});
			await writeLessonOrder(reorder);
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
