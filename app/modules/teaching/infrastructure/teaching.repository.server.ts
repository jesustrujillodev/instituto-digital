import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { resolveAssetRef } from "@/shared/storage/public-url";
import type { TeachingCourseWhere } from "../domain/teaching.access";
import {
	TEACHABLE_STATUSES,
	TEACHING_LIST_DEFAULTS,
	TEACHING_SORT_DEFAULT,
} from "../domain/teaching.config";
import {
	toTeachingCourse,
	toTeachingCourseSummary,
} from "../domain/teaching.mapper";
import type { ITeachingRepository } from "../domain/teaching.repository";
import type { ListTeachingCoursesDto } from "../domain/teaching.types";

type Dependencies = {
	prisma: ICradle["prisma"];
	assetUrlResolver: ICradle["assetUrlResolver"];
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
		createdById: true,
		dependency: { select: { name: true } },
		modality: true,
		format: true,
		completionRule: true,
		status: true,
		minAttendance: true,
		requiresEvaluation: true,
		evaluationMethod: true,
		finishedAt: true,
		enrollmentClosedAt: true,
		qrToken: true,
		qrTokenRotatedAt: true,
		qrOpensBeforeMinutes: true,
		qrClosesAfterMinutes: true,
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
				progressPercent: true,
				contentCompletedAt: true,
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

/** Desempate por la última modificación: el orden de una página no baila. */
const toOrderBy = (
	filters: ListTeachingCoursesDto,
): Prisma.CourseOrderByWithRelationInput[] => {
	const sortBy = filters.sortBy ?? TEACHING_SORT_DEFAULT.sortBy;
	const sortDir = filters.sortDir ?? TEACHING_SORT_DEFAULT.sortDir;

	return sortBy === "updatedAt"
		? [{ updatedAt: sortDir }]
		: [{ [sortBy]: sortDir }, { updatedAt: "desc" }];
};

export const createTeachingRepository = ({
	prisma,
	assetUrlResolver,
}: Dependencies): ITeachingRepository => ({
	async findCourses(filters, where) {
		const page = filters.page ?? TEACHING_LIST_DEFAULTS.page;
		const pageSize = filters.pageSize ?? TEACHING_LIST_DEFAULTS.pageSize;

		const rows = await prisma.course.findMany({
			where: listWhere(filters, where),
			orderBy: toOrderBy(filters),
			skip: (page - 1) * pageSize,
			take: pageSize,
			select: {
				documentId: true,
				title: true,
				coverImageUrl: true,
				dependency: { select: { name: true } },
				modality: true,
				status: true,
				sessions: { orderBy: { startsAt: "asc" }, select: { startsAt: true } },
				_count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
			},
		});

		return rows.map((row) =>
			toTeachingCourseSummary(row, (reference) =>
				resolveAssetRef(assetUrlResolver, reference),
			),
		);
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
				source: "MANUAL",
				recordedById: actorId,
				recordedAt: at,
			} satisfies Prisma.CourseAttendanceUncheckedUpdateInput;

			await prisma.courseAttendance.upsert({
				where: { sessionId_userId: { sessionId, userId: mark.userId } },
				create: { sessionId, userId: mark.userId, ...data },
				update: data,
			});
		}
	},

	async checkIn(sessionId, userId, at) {
		const stored = await prisma.courseAttendance.findUnique({
			where: { sessionId_userId: { sessionId, userId } },
			select: { attended: true, source: true },
		});

		if (stored?.attended && stored.source === "QR") return false;

		const data = {
			attended: true,
			source: "QR",
			recordedById: userId,
			recordedAt: at,
		} satisfies Prisma.CourseAttendanceUncheckedUpdateInput;

		await prisma.courseAttendance.upsert({
			where: { sessionId_userId: { sessionId, userId } },
			create: { sessionId, userId, ...data },
			update: data,
		});

		return true;
	},
});
