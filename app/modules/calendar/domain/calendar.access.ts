import {
	courseScopeWhere,
	VIEWABLE_STATUSES,
} from "@/modules/courses/domain/course.access";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { CalendarPlan } from "./calendar.types";

type CalendarBranch = Record<string, unknown>;

/** Fragmento de `where` sobre cursos; el repositorio lo entrega a Prisma. */
export type CalendarCourseFilter = { OR: CalendarBranch[] };

const ALL_BUT_CANCELLED: readonly CourseStatus[] = [
	"DRAFT",
	...VIEWABLE_STATUSES,
];

/**
 * `where` de "los cursos que le tocan a esta persona en su calendario".
 *
 * No es `courseVisibilityWhere`: aquella responde "qué podría ver" —todo lo
 * público, por ejemplo— y el calendario muestra solo lo propio: lo que cursa, lo
 * que imparte y lo que organiza (§6.7). Un borrador solo entra por la rama del
 * organizador, y un cancelado por ninguna.
 */
export const calendarCourseWhere = (
	plan: CalendarPlan,
): CalendarCourseFilter => {
	const viewable = { status: { in: VIEWABLE_STATUSES } };
	const branches: CalendarBranch[] = [
		{ ...viewable, trainers: { some: { userId: plan.viewerId } } },
	];

	if (plan.organizer.kind !== "none") {
		branches.push({
			...courseScopeWhere(plan.organizer),
			status: { in: ALL_BUT_CANCELLED },
		});
	}

	if (plan.participates) {
		branches.push({
			...viewable,
			enrollments: { some: { userId: plan.viewerId, status: "ENROLLED" } },
		});
		branches.push({
			status: "PUBLISHED",
			enrollments: { some: { userId: plan.viewerId, status: "INVITED" } },
		});
	}

	if (plan.staffDependencyId !== null) {
		branches.push({
			...viewable,
			enrollments: {
				some: {
					status: "ENROLLED",
					user: { dependencyId: plan.staffDependencyId },
				},
			},
		});
	}

	return { OR: branches };
};
