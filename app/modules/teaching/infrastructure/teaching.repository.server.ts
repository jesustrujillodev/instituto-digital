import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import type { TeachingCourseWhere } from "../domain/teaching.access";
import {
	TEACHABLE_STATUSES,
	TEACHING_LIST_DEFAULTS,
} from "../domain/teaching.config";
import {
	toTeachingCourse,
	toTeachingCourseSummary,
} from "../domain/teaching.mapper";
import type { ITeachingRepository } from "../domain/teaching.repository";
import type { ListTeachingCoursesDto } from "../domain/teaching.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const PERSON_SELECT = {
	firstName: true,
	lastName: true,
	email: true,
} satisfies Prisma.UserSelect;

/** La asistencia se acota a las sesiones del curso que se está leyendo. */
const courseSelect = (sessionFilter: Prisma.CourseSessionWhereInput) =>
	({
		id: true,
		documentId: true,
		title: true,
		dependencyId: true,
		dependency: { select: { name: true } },
		modality: true,
		status: true,
		minAttendance: true,
		requiresEvaluation: true,
		finishedAt: true,
		sessions: {
			orderBy: { startsAt: "asc" },
			select: {
				id: true,
				documentId: true,
				startsAt: true,
				endsAt: true,
				venue: true,
				link: true,
			},
		},
		trainers: {
			orderBy: { assignedAt: "asc" },
			select: { user: { select: PERSON_SELECT } },
		},
		enrollments: {
			where: { status: "ENROLLED" },
			orderBy: [{ user: { firstName: "asc" } }, { user: { email: "asc" } }],
			select: {
				result: true,
				grade: true,
				completed: true,
				user: {
					select: {
						...PERSON_SELECT,
						id: true,
						documentId: true,
						type: true,
						dependencyId: true,
						dependency: { select: { name: true } },
						attendance: {
							where: { session: sessionFilter },
							select: { sessionId: true, attended: true },
						},
					},
				},
			},
		},
	}) satisfies Prisma.CourseSelect;

// El filtro de dominio usa arreglos `readonly`, que Prisma no acepta tal cual.
const asWhere = (where: TeachingCourseWhere) =>
	where as unknown as Prisma.CourseWhereInput;

const listWhere = (
	filters: ListTeachingCoursesDto,
	where: TeachingCourseWhere,
): Prisma.CourseWhereInput => ({
	AND: [
		asWhere(where),
		{
			status: {
				in: filters.status ? [filters.status] : [...TEACHABLE_STATUSES],
			},
		},
		...(filters.search
			? [
					{
						title: {
							contains: filters.search,
							mode: Prisma.QueryMode.insensitive,
						},
					},
				]
			: []),
	],
});

export const createTeachingRepository = ({
	prisma,
}: Dependencies): ITeachingRepository => ({
	async findCourses(filters, where) {
		const page = filters.page ?? TEACHING_LIST_DEFAULTS.page;
		const pageSize = filters.pageSize ?? TEACHING_LIST_DEFAULTS.pageSize;

		const rows = await prisma.course.findMany({
			where: listWhere(filters, where),
			// Publicados primero: son los que todavía piden lista o cierre.
			orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
			skip: (page - 1) * pageSize,
			take: pageSize,
			select: {
				documentId: true,
				title: true,
				dependency: { select: { name: true } },
				modality: true,
				status: true,
				sessions: { orderBy: { startsAt: "asc" }, select: { startsAt: true } },
				_count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
			},
		});

		return rows.map(toTeachingCourseSummary);
	},

	async countCourses(filters, where) {
		return prisma.course.count({ where: listWhere(filters, where) });
	},

	async findCourse(documentId, where) {
		const course = await prisma.course.findFirst({
			where: {
				AND: [
					{ documentId, status: { in: [...TEACHABLE_STATUSES] } },
					asWhere(where),
				],
			},
			select: courseSelect({ course: { documentId } }),
		});

		return course ? toTeachingCourse(course) : null;
	},

	async findCourseById(courseId) {
		const course = await prisma.course.findUniqueOrThrow({
			where: { id: courseId },
			select: courseSelect({ courseId }),
		});

		return toTeachingCourse(course);
	},

	async saveAttendance(sessionId, marks, actorId, at) {
		// Secuencial: la transacción interactiva de Prisma no admite consultas en paralelo.
		for (const mark of marks) {
			const data = {
				attended: mark.attended,
				recordedById: actorId,
				recordedAt: at,
			};

			await prisma.courseAttendance.upsert({
				where: { sessionId_userId: { sessionId, userId: mark.userId } },
				create: { sessionId, userId: mark.userId, ...data },
				update: data,
			});
		}
	},
});
