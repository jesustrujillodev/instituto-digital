import type { ICradle } from "@/shared/di/container.types";
import type { IClassroomRepository } from "../domain/classroom.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const ACTIVE = { archivedAt: null } as const;

/** Una lección cuenta mientras ella y su módulo sigan activos. */
const activeLessonOf = (courseId: number) => ({
	...ACTIVE,
	module: { courseId, ...ACTIVE },
});

export const createClassroomRepository = ({
	prisma,
}: Dependencies): IClassroomRepository => ({
	async findCourse(courseDocumentId, userId) {
		const course = await prisma.course.findUnique({
			where: { documentId: courseDocumentId },
			select: {
				id: true,
				documentId: true,
				title: true,
				status: true,
				format: true,
				completionRule: true,
				requiresEvaluation: true,
				evaluationMethod: true,
				enrollments: {
					where: { userId },
					select: {
						status: true,
						progressPercent: true,
						contentCompletedAt: true,
						completed: true,
					},
				},
			},
		});
		if (!course) return null;

		const { enrollments, ...rest } = course;
		return { ...rest, enrollment: enrollments.at(0) ?? null };
	},

	async findProgress(courseId, userId) {
		const rows = await prisma.lessonProgress.findMany({
			where: { userId, lesson: activeLessonOf(courseId) },
			select: { status: true, lesson: { select: { documentId: true } } },
		});

		return rows.map((row) => ({
			lessonDocumentId: row.lesson.documentId,
			status: row.status,
		}));
	},

	async findCompletedLessons(courseId, userIds) {
		const rows = await prisma.lessonProgress.findMany({
			where: {
				status: "COMPLETED",
				lesson: activeLessonOf(courseId),
				...(userIds ? { userId: { in: [...userIds] } } : {}),
			},
			select: { userId: true, lesson: { select: { documentId: true } } },
		});

		return rows.map((row) => ({
			userId: row.userId,
			lessonDocumentId: row.lesson.documentId,
		}));
	},

	async saveProgress(lessonId, userId, status, at) {
		const completedAt = status === "COMPLETED" ? at : null;

		await prisma.lessonProgress.upsert({
			where: { lessonId_userId: { lessonId, userId } },
			create: { lessonId, userId, status, startedAt: at, completedAt },
			update: { status, completedAt },
		});
	},

	async findClassroomCourses(userId) {
		const courses = await prisma.course.findMany({
			where: {
				status: { in: ["PUBLISHED", "FINISHED"] },
				enrollments: { some: { userId, status: "ENROLLED" } },
				// Con lecciones o cuestionarios de módulo, o evaluado por un examen que
				// ya tiene preguntas: el aula es también donde se presentan
				// (docs/adr/0015, 0016).
				OR: [
					{ modules: { some: { ...ACTIVE, lessons: { some: ACTIVE } } } },
					{
						modules: {
							some: {
								...ACTIVE,
								quizzes: { some: { ...ACTIVE, questions: { some: {} } } },
							},
						},
					},
					{
						requiresEvaluation: true,
						evaluationMethod: "QUIZ",
						quizzes: {
							some: {
								lessonId: null,
								moduleId: null,
								...ACTIVE,
								questions: { some: {} },
							},
						},
					},
				],
			},
			select: { documentId: true },
		});

		return courses.map((course) => course.documentId);
	},
});
