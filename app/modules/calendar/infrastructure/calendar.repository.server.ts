import type { Prisma } from "@prisma/client";
import { ACTIVE_ENROLLMENT_STATUSES } from "@/modules/enrollments/domain/enrollment.config";
import type { ICradle } from "@/shared/di/container.types";
import { toCalendarSessionRow } from "../domain/calendar.mapper";
import type { ICalendarRepository } from "../domain/calendar.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

export const createCalendarRepository = ({
	prisma,
}: Dependencies): ICalendarRepository => ({
	async findSessions({ from, to, courseFilter, viewerId, staffDependencyId }) {
		const rows = await prisma.courseSession.findMany({
			where: {
				startsAt: { gte: from, lt: to },
				// El filtro de dominio usa arreglos `readonly`, que Prisma no acepta tal cual.
				course: courseFilter as unknown as Prisma.CourseWhereInput,
			},
			orderBy: [{ startsAt: "asc" }, { id: "asc" }],
			select: {
				documentId: true,
				startsAt: true,
				endsAt: true,
				venue: true,
				link: true,
				course: {
					select: {
						documentId: true,
						title: true,
						modality: true,
						status: true,
						dependencyId: true,
						createdById: true,
						dependency: { select: { documentId: true, name: true } },
						trainers: {
							orderBy: { assignedAt: "asc" },
							select: {
								userId: true,
								user: {
									select: {
										documentId: true,
										firstName: true,
										lastName: true,
										email: true,
									},
								},
							},
						},
						enrollments: {
							where: {
								userId: viewerId,
								status: { in: [...ACTIVE_ENROLLMENT_STATUSES] },
							},
							select: { status: true },
						},
						_count: {
							select: {
								enrollments: {
									// Sin dependencia consultada, `IN ()` no cuenta ninguna fila.
									where:
										staffDependencyId === null
											? { id: { in: [] } }
											: {
													status: "ENROLLED",
													user: { dependencyId: staffDependencyId },
												},
								},
							},
						},
					},
				},
			},
		});

		return rows.map(toCalendarSessionRow);
	},
});
