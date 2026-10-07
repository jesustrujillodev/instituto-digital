import type { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { openEnrollmentWhere } from "../domain/enrollment.access";
import type { IEnrollmentSummaryRepository } from "../domain/enrollment-summary.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

export const createEnrollmentSummaryRepository = ({
	prisma,
}: Dependencies): IEnrollmentSummaryRepository => ({
	async findOpenCourses({ filter, now, take }) {
		// Los filtros de dominio usan arreglos `readonly`, que Prisma no acepta tal cual.
		const where = {
			AND: [filter, ...openEnrollmentWhere(now)],
		} as unknown as Prisma.CourseWhereInput;

		const [courses, invitations] = await Promise.all([
			prisma.course.findMany({
				where,
				orderBy: { id: "asc" },
				take,
				select: {
					id: true,
					documentId: true,
					title: true,
					format: true,
					capacity: true,
					enrollmentDeadline: true,
					sessions: {
						orderBy: { startsAt: "asc" },
						take: 1,
						select: { startsAt: true },
					},
					_count: {
						select: { enrollments: { where: { status: "ENROLLED" } } },
					},
				},
			}),
			prisma.enrollment.groupBy({
				by: ["courseId"],
				where: { status: "INVITED", course: where },
				_count: { _all: true },
			}),
		]);

		const invitedByCourse = new Map(
			invitations.map((row) => [row.courseId, row._count._all]),
		);

		return courses.map(({ sessions, _count, ...course }) => ({
			...course,
			firstSessionAt: sessions[0]?.startsAt ?? null,
			enrolled: _count.enrollments,
			invited: invitedByCourse.get(course.id) ?? 0,
		}));
	},
});
