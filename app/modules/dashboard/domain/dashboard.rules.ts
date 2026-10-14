import { canManagePlans } from "@/modules/annual-plan/domain/annual-plan.access";
import type {
	CurrentPlanSummary,
	PlanCoverage,
} from "@/modules/annual-plan/domain/annual-plan.types";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { zonedDayOf } from "@/modules/calendar/domain/calendar.rules";
import type {
	CalendarSession,
	CalendarWeek,
} from "@/modules/calendar/domain/calendar.types";
import { resolveCourseScope } from "@/modules/courses/domain/course.access";
import type { CourseAttention } from "@/modules/courses/domain/course-attention.types";
import { canParticipate } from "@/modules/enrollments/domain/enrollment.rules";
import type { MyCourseInvitation } from "@/modules/enrollments/domain/enrollment-summary.types";
import {
	canTeach,
	ownTeachingScope,
} from "@/modules/teaching/domain/teaching.access";
import type { TeachingPending } from "@/modules/teaching/domain/teaching.types";
import { resolveScope } from "@/shared/auth/scope.rules";
import type {
	AttentionItem,
	CoverageTotals,
	DashboardAttention,
	DashboardFacets,
	DashboardPlatform,
	DashboardToday,
	PlatformAttentionItem,
	PlatformAttentionList,
	TodaySession,
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

/** «Para hoy» y su atención existen para quien cursa, imparte u organiza; la plataforma tiene lo suyo. */
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

const sessionsOf = (week: CalendarWeek, now: Date): TodaySession[] =>
	week.sessions.flatMap((session): TodaySession[] => {
		const role = sessionRoleOf(session);
		if (!role) return [];
		if (zonedDayOf(session.startsAt) !== week.today) return [];
		if (session.endsAt <= now) return [];

		return [
			{
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

/** Las sesiones de hoy que siguen o están en curso. */
export const buildToday = (
	input: { now: Date; week: CalendarWeek },
	limit: number,
): DashboardToday => {
	// La semana ya viene ordenada por inicio.
	const sessions = sessionsOf(input.week, input.now);

	return {
		sessions: sessions.slice(0, limit),
		overflow: Math.max(0, sessions.length - limit),
	};
};

/**
 * Lo que espera una decisión, en este orden: los cursos que ya terminaron y
 * falta finalizar, las invitaciones a punto de cerrar, los cursos publicados
 * sin capacitador, las líneas del plan atrasadas y los borradores sin publicar.
 * Cada lista llega ya recortada por su lectura.
 */
export const buildAttention = (input: {
	pending: TeachingPending | null;
	invitations: readonly MyCourseInvitation[];
	courses: CourseAttention | null;
	plan: CurrentPlanSummary | null;
}): DashboardAttention => {
	const { pending, courses, plan } = input;
	const courseHrefOf = (documentId: string) =>
		`/dashboard/capacitaciones/${documentId}`;
	const overdue = plan?.dueLines.filter((line) => line.overdue) ?? [];

	const items: AttentionItem[] = [
		...(pending?.awaitingFinish ?? []).map(
			(course): AttentionItem => ({
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
				(invitation): AttentionItem => ({
					kind: "invitation",
					courseDocumentId: invitation.courseDocumentId,
					title: invitation.title,
					href: myCourseHrefOf(invitation.courseDocumentId),
					closesAt: invitation.closesAt,
				}),
			),
		...(courses?.withoutTrainer.courses ?? []).map(
			(course): AttentionItem => ({
				kind: "withoutTrainer",
				courseDocumentId: course.documentId,
				title: course.title,
				href: courseHrefOf(course.documentId),
				firstSessionAt: course.firstSessionAt,
			}),
		),
		...overdue.map(
			(line): AttentionItem => ({
				kind: "overdueLine",
				lineDocumentId: line.documentId,
				title: line.title,
				plannedMonth: line.plannedMonth,
				href: `/dashboard/capacitaciones/nuevo?linea=${line.documentId}`,
			}),
		),
		...(courses?.drafts.courses ?? []).map(
			(course): AttentionItem => ({
				kind: "draft",
				courseDocumentId: course.documentId,
				title: course.title,
				href: courseHrefOf(course.documentId),
				updatedAt: course.updatedAt,
			}),
		),
	];

	return {
		items,
		more: {
			pendingFinish: pending?.truncated ?? false,
			withoutTrainer: courses?.withoutTrainer.truncated ?? false,
			// Las que no se leyeron también pueden estar atrasadas.
			overdueLine:
				overdue.length > 0 &&
				(plan?.dueTotal ?? 0) > (plan?.dueLines.length ?? 0),
			draft: courses?.drafts.truncated ?? false,
		},
	};
};

/**
 * Lo que el superadministrador tiene que resolver: primero los correos y los
 * trabajos de fondo que fallaron, luego las dependencias sin titular. Sin
 * titular nadie arma el plan, así que la falta de plan se anota en la misma
 * dependencia en vez de contarse aparte.
 */
export const buildPlatformAttention = (
	platform: Pick<DashboardPlatform, "health" | "withoutHead" | "coverage">,
	limit: number,
): PlatformAttentionList => {
	const { health, withoutHead, coverage } = platform;
	const withoutPlan = new Set(
		coverage.withoutPlan.map((dependency) => dependency.documentId),
	);
	const operations: PlatformAttentionItem[] = [];
	if (health.failedEmails > 0 || health.stuckEmails > 0)
		operations.push({
			kind: "emails",
			failed: health.failedEmails,
			stuck: health.stuckEmails,
		});
	if (health.recentJobFailures > 0)
		operations.push({
			kind: "jobs",
			failed: health.recentJobFailures,
			windowDays: health.windowDays,
		});

	return {
		items: [
			...operations,
			...withoutHead.slice(0, limit).map(
				(dependency): PlatformAttentionItem => ({
					kind: "withoutHead",
					dependency,
					withoutPlan: withoutPlan.has(dependency.documentId),
				}),
			),
		],
		overflow: Math.max(0, withoutHead.length - limit),
	};
};

/** El avance de todos los planes del ejercicio sumado como si fuera uno. */
export const summarizeCoverage = (coverage: PlanCoverage): CoverageTotals => {
	let done = 0;
	let active = 0;
	for (const { progress } of coverage.plans) {
		done += progress.done;
		active += progress.total - progress.cancelled;
	}

	return {
		done,
		active,
		ratio: active === 0 ? null : done / active,
		withPlan: coverage.plans.length,
		dependencies: coverage.plans.length + coverage.withoutPlan.length,
	};
};

/**
 * Los planes de menor a mayor avance: quien va más atrás queda arriba. Los que
 * no tienen nada vigente van al final, porque no hay avance que comparar.
 */
export const sortPlansByProgress = <
	T extends { dependencyName: string; progress: { ratio: number | null } },
>(
	plans: readonly T[],
): T[] =>
	[...plans].sort((a, b) => {
		const left = a.progress.ratio ?? Number.POSITIVE_INFINITY;
		const right = b.progress.ratio ?? Number.POSITIVE_INFINITY;
		if (left !== right) return left < right ? -1 : 1;
		return a.dependencyName.localeCompare(b.dependencyName, "es");
	});
