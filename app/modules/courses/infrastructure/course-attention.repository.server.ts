import type { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import type { ICourseAttentionRepository } from "../domain/course-attention.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const ITEM_SELECT = {
	documentId: true,
	title: true,
	updatedAt: true,
	sessions: {
		orderBy: { startsAt: "asc" },
		take: 1,
		select: { startsAt: true },
	},
} satisfies Prisma.CourseSelect;

type ItemRow = Prisma.CourseGetPayload<{ select: typeof ITEM_SELECT }>;

const toItem = ({ sessions, ...row }: ItemRow) => ({
	...row,
	firstSessionAt: sessions[0]?.startsAt ?? null,
});

export const createCourseAttentionRepository = ({
	prisma,
}: Dependencies): ICourseAttentionRepository => ({
	async findDrafts(filter, take) {
		const rows = await prisma.course.findMany({
			where: { AND: [filter, { status: "DRAFT" }] },
			orderBy: { updatedAt: "desc" },
			take,
			select: ITEM_SELECT,
		});

		return rows.map(toItem);
	},

	async findWithoutActiveTrainer(filter, take) {
		const rows = await prisma.course.findMany({
			where: {
				AND: [
					filter,
					{ status: "PUBLISHED" },
					// Lo mismo que `requiresTrainer`: calendarizado, o híbrido con sesiones.
					{ OR: [{ format: "SCHEDULED" }, { modality: "HYBRID" }] },
					// Activo es lo que `isActive` del mapper de cursos: cuenta y perfil vigentes.
					{
						trainers: {
							none: {
								user: {
									archivedAt: null,
									trainerProfile: { is: { archivedAt: null } },
								},
							},
						},
					},
				],
			},
			orderBy: { updatedAt: "desc" },
			take,
			select: ITEM_SELECT,
		});

		return rows.map(toItem);
	},
});
