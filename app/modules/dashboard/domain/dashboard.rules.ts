import { canManagePlans } from "@/modules/annual-plan/domain/annual-plan.access";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { zonedDayOf } from "@/modules/calendar/domain/calendar.rules";
import type {
	CalendarSession,
	CalendarWeek,
} from "@/modules/calendar/domain/calendar.types";
import { resolveCourseScope } from "@/modules/courses/domain/course.access";
import { canParticipate } from "@/modules/enrollments/domain/enrollment.rules";
import type { MyCourseInvitation } from "@/modules/enrollments/domain/enrollment-summary.types";
import {
	canTeach,
	ownTeachingScope,
} from "@/modules/teaching/domain/teaching.access";
import type { PendingFinishCourse } from "@/modules/teaching/domain/teaching.types";
import { resolveScope } from "@/shared/auth/scope.rules";
import type {
	DashboardFacets,
	DashboardToday,
	NextUp,
	TodayItem,
} from "./dashboard.types";

type DashboardActor = Pick<
	AuthContext,
	"userId" | "role" | "dependencyId" | "isTrainer"
>;

export const resolveDashboardFacets = (
	actor: DashboardActor,
): DashboardFacets => {
	const scope = resolveScope(actor);
	const courseScope = resolveCourseScope(actor);

	return {
		participates: canParticipate(actor),
		teaches: actor.isTrainer,
		organizes:
			courseScope.kind === "dependency" || courseScope.kind === "creator",
		plans: canManagePlans(scope),
		platform: scope.kind === "global",
	};
};

/**
 * Hay cursos por finalizar que le tocan: los que imparte o los que organiza su
 * dependencia. Es la misma condición con la que el servicio de impartición lo
 * dejaría pasar, así que preguntar nunca termina en un FORBIDDEN.
 */
export const watchesPendingFinish = (actor: DashboardActor): boolean =>
	canTeach(ownTeachingScope(actor));

/** «Para hoy» existe para quien cursa, imparte u organiza; la plataforma tiene lo suyo. */
export const hasTodayPanel = (facets: DashboardFacets): boolean =>
	facets.participates || facets.teaches || facets.organizes;

/** Desde qué lado le toca la sesión; imparte gana si además la cursa. */
const sessionRoleOf = (
	session: CalendarSession,
): "teaching" | "learning" | null => {
	if (session.lenses.includes("teaching")) return "teaching";
	if (session.lenses.includes("enrolled")) return "learning";
	return null;
};

const teachingHrefOf = (courseDocumentId: string) =>
	`/dashboard/imparticion/${courseDocumentId}`;

const myCourseHrefOf = (courseDocumentId: string) =>
	`/dashboard/mis-capacitaciones/${courseDocumentId}`;

const sessionItemsOf = (week: CalendarWeek, now: Date): TodayItem[] =>
	week.sessions.flatMap((session): TodayItem[] => {
		const role = sessionRoleOf(session);
		if (!role) return [];
		if (zonedDayOf(session.startsAt) !== week.today) return [];
		if (session.endsAt <= now) return [];

		return [
			{
				kind: "session",
				role,
				sessionDocumentId: session.documentId,
				courseDocumentId: session.course.documentId,
				title: session.course.title,
				href:
					role === "teaching"
						? teachingHrefOf(session.course.documentId)
						: (session.courseHref ?? myCourseHrefOf(session.course.documentId)),
				startsAt: session.startsAt,
				endsAt: session.endsAt,
				venue: session.venue,
				link: session.link,
				inProgress: session.startsAt <= now,
			},
		];
	});

const nextUpOf = (week: CalendarWeek, now: Date): NextUp | null => {
	for (const session of week.sessions) {
		const role = sessionRoleOf(session);
		if (role && session.startsAt > now) {
			return { title: session.course.title, startsAt: session.startsAt, role };
		}
	}
	return null;
};

/**
 * Lo que vence hoy, en este orden: las sesiones que siguen o están en curso,
 * los cursos cuyas sesiones ya terminaron y falta finalizar, y las
 * invitaciones a punto de cerrar.
 */
export const buildToday = (
	input: {
		now: Date;
		week: CalendarWeek;
		pendingFinish: readonly PendingFinishCourse[];
		invitations: readonly MyCourseInvitation[];
	},
	limit: number,
): DashboardToday => {
	const items: TodayItem[] = [
		// La semana ya viene ordenada por inicio.
		...sessionItemsOf(input.week, input.now),
		...input.pendingFinish.map(
			(course): TodayItem => ({
				kind: "pendingFinish",
				courseDocumentId: course.documentId,
				title: course.title,
				href: teachingHrefOf(course.documentId),
				lastSessionEndsAt: course.lastSessionEndsAt,
			}),
		),
		...input.invitations
			.filter((invitation) => invitation.closesSoon)
			.map(
				(invitation): TodayItem => ({
					kind: "invitation",
					courseDocumentId: invitation.courseDocumentId,
					title: invitation.title,
					href: myCourseHrefOf(invitation.courseDocumentId),
					closesAt: invitation.closesAt,
				}),
			),
	];

	return {
		items: items.slice(0, limit),
		overflow: Math.max(0, items.length - limit),
		nextUp: nextUpOf(input.week, input.now),
	};
};
