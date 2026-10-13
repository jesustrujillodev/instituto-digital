import { Prisma } from "@prisma/client";
import type { TeachingCourseWhere } from "@/modules/teaching/domain/teaching.access";
import type { ICradle } from "@/shared/di/container.types";
import { RatingAlreadyRatedError } from "../domain/rating.errors";
import { toCourseRatingSummary } from "../domain/rating.mapper";
import type { IRatingRepository } from "../domain/rating.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const courseWhereOf = (
	documentId: string,
	where: TeachingCourseWhere,
): Prisma.CourseWhereInput => ({
	AND: [
		{ documentId },
		// El filtro de dominio usa arreglos `readonly`, que Prisma no acepta tal cual.
		where as unknown as Prisma.CourseWhereInput,
	],
});

export const createRatingRepository = ({
	prisma,
}: Dependencies): IRatingRepository => ({
	async findEligibility(courseDocumentId, userId) {
		const course = await prisma.course.findUnique({
			where: { documentId: courseDocumentId },
			select: {
				id: true,
				status: true,
				format: true,
				enrollments: {
					where: { userId },
					select: { status: true, completed: true },
				},
				ratings: { where: { userId }, select: { id: true } },
				_count: {
					select: {
						sessions: {
							where: { attendance: { some: { userId, attended: true } } },
						},
					},
				},
			},
		});
		if (!course) return null;

		return {
			courseId: course.id,
			courseStatus: course.status,
			courseFormat: course.format,
			enrollmentStatus: course.enrollments.at(0)?.status ?? null,
			attendedSessions: course._count.sessions,
			completed: course.enrollments.at(0)?.completed ?? false,
			alreadyRated: course.ratings.length > 0,
		};
	},

	async create(data) {
		try {
			await prisma.courseRating.create({ data });
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new RatingAlreadyRatedError();
			}
			throw error;
		}
	},

	async findCourseId(documentId, where: TeachingCourseWhere) {
		const course = await prisma.course.findFirst({
			where: courseWhereOf(documentId, where),
			select: { id: true },
		});

		return course?.id ?? null;
	},

	async summarizeCourse(courseDocumentId, where) {
		const rows = await prisma.courseRating.findMany({
			where: { course: courseWhereOf(courseDocumentId, where) },
			// Ni `userId` ni la fecha, y un orden que no sigue al de llegada: el
			// anonimato empieza en la proyección.
			orderBy: [{ score: "desc" }, { comment: "asc" }],
			select: { score: true, comment: true },
		});

		return toCourseRatingSummary(rows);
	},
});
