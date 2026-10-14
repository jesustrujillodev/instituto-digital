import { describe, expect, test } from "vitest";
import type { CurrentPlanSummary } from "@/modules/annual-plan/domain/annual-plan.types";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CalendarSession,
	CalendarWeek,
} from "@/modules/calendar/domain/calendar.types";
import type { CourseAttention } from "@/modules/courses/domain/course-attention.types";
import type { MyCourseInvitation } from "@/modules/enrollments/domain/enrollment-summary.types";
import type { PendingFinishCourse } from "@/modules/teaching/domain/teaching.types";
import {
	buildAttention,
	buildPlatformAttention,
	buildToday,
	hasTodayPanel,
	resolveDashboardFacets,
	sortPlansByProgress,
	summarizeCoverage,
	watchesPendingFinish,
} from "../dashboard.rules";

// 10:00 del miércoles 7 de octubre de 2026 en Tijuana.
const NOW = new Date("2026-10-07T17:00:00.000Z");

const actorOf = (
	overrides: Partial<AuthContext> = {},
): Pick<AuthContext, "userId" | "role" | "dependencyId" | "isTrainer"> => ({
	userId: 50,
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const sessionOf = (
	documentId: string,
	startsAt: string,
	endsAt: string,
	overrides: Partial<CalendarSession> = {},
): CalendarSession => ({
	documentId,
	startsAt: new Date(startsAt),
	endsAt: new Date(endsAt),
	venue: "Sala 3",
	link: null,
	course: {
		documentId: `c-${documentId}`,
		title: `Curso ${documentId}`,
		modality: "IN_PERSON",
		status: "PUBLISHED",
		dependency: { documentId: "d", name: "Obras Públicas" },
	},
	trainers: [],
	lenses: ["enrolled"],
	courseHref: `/dashboard/mis-capacitaciones/c-${documentId}`,
	...overrides,
});

const weekOf = (sessions: CalendarSession[]): CalendarWeek => ({
	today: "2026-10-07",
	days: [
		"2026-10-07",
		"2026-10-08",
		"2026-10-09",
		"2026-10-10",
		"2026-10-11",
		"2026-10-12",
		"2026-10-13",
	],
	sessions,
	truncated: false,
});

const pendingOf = (documentId: string): PendingFinishCourse => ({
	documentId,
	title: `Curso ${documentId}`,
	lastSessionEndsAt: new Date("2026-10-03T20:00:00.000Z"),
	enrolledCount: 12,
	teaching: true,
	organizing: false,
});

const invitationOf = (
	documentId: string,
	closesSoon: boolean,
): MyCourseInvitation => ({
	courseDocumentId: documentId,
	title: `Curso ${documentId}`,
	dependencyName: "Obras Públicas",
	modality: "ONLINE",
	format: "SCHEDULED",
	closesAt: new Date("2026-10-08T07:00:00.000Z"),
	closesSoon,
	firstSessionAt: null,
});

describe("resolveDashboardFacets", () => {
	test.each([
		[
			"participante",
			actorOf(),
			{
				participates: true,
				teaches: false,
				organizes: false,
				plans: false,
				platform: false,
			},
		],
		[
			"capacitador interno",
			actorOf({ isTrainer: true }),
			{
				participates: true,
				teaches: true,
				organizes: true,
				plans: false,
				platform: false,
			},
		],
		[
			"capacitador externo",
			actorOf({ dependencyId: null, isTrainer: true }),
			{
				participates: false,
				teaches: true,
				organizes: false,
				plans: false,
				platform: false,
			},
		],
		[
			"titular",
			actorOf({ role: "DEPENDENCY_HEAD" }),
			{
				participates: true,
				teaches: false,
				organizes: true,
				plans: true,
				platform: false,
			},
		],
		[
			"auxiliar capacitador",
			actorOf({ role: "DEPENDENCY_DEPUTY", isTrainer: true }),
			{
				participates: true,
				teaches: true,
				organizes: true,
				plans: true,
				platform: false,
			},
		],
		[
			"superadministrador",
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
			{
				participates: false,
				teaches: false,
				organizes: false,
				plans: false,
				platform: true,
			},
		],
		[
			"titular sin dependencia",
			actorOf({ role: "DEPENDENCY_HEAD", dependencyId: null }),
			{
				participates: false,
				teaches: false,
				organizes: false,
				plans: false,
				platform: false,
			},
		],
	])("%s", (_name, actor, facets) => {
		expect(resolveDashboardFacets(actor)).toEqual(facets);
	});
});

describe("watchesPendingFinish", () => {
	test("le toca a quien imparte o a quien organiza por su dependencia", () => {
		expect(watchesPendingFinish(actorOf({ isTrainer: true }))).toBe(true);
		expect(watchesPendingFinish(actorOf({ role: "DEPENDENCY_HEAD" }))).toBe(
			true,
		);
		expect(watchesPendingFinish(actorOf())).toBe(false);
	});

	test("al superadministrador no le pone el trabajo de toda la plataforma", () => {
		expect(
			watchesPendingFinish(actorOf({ role: "SUPERADMIN", dependencyId: null })),
		).toBe(false);
	});
});

describe("hasTodayPanel", () => {
	test("solo la plataforma no tiene «Para hoy»", () => {
		expect(
			hasTodayPanel(
				resolveDashboardFacets(
					actorOf({ role: "SUPERADMIN", dependencyId: null }),
				),
			),
		).toBe(false);
		expect(hasTodayPanel(resolveDashboardFacets(actorOf()))).toBe(true);
	});
});

describe("buildToday", () => {
	test("solo las sesiones de hoy que no han terminado, con su lado", () => {
		const today = buildToday(
			{
				now: NOW,
				week: weekOf([
					sessionOf(
						"terminada",
						"2026-10-07T14:00:00.000Z",
						"2026-10-07T16:00:00.000Z",
					),
					sessionOf(
						"en-curso",
						"2026-10-07T16:30:00.000Z",
						"2026-10-07T18:00:00.000Z",
						{
							lenses: ["teaching", "enrolled"],
						},
					),
					sessionOf(
						"tarde",
						"2026-10-07T23:00:00.000Z",
						"2026-10-08T01:00:00.000Z",
					),
					sessionOf(
						"mañana",
						"2026-10-08T16:00:00.000Z",
						"2026-10-08T18:00:00.000Z",
					),
					sessionOf(
						"ajena",
						"2026-10-07T20:00:00.000Z",
						"2026-10-07T22:00:00.000Z",
						{
							lenses: ["organizing"],
						},
					),
				]),
			},
			6,
		);

		expect(today.sessions).toMatchObject([
			{
				sessionDocumentId: "en-curso",
				role: "teaching",
				inProgress: true,
				href: "/dashboard/imparticion/c-en-curso",
			},
			{
				sessionDocumentId: "tarde",
				role: "learning",
				inProgress: false,
				href: "/dashboard/mis-capacitaciones/c-tarde",
			},
		]);
	});

	test("recorta al tope y cuenta lo que no cupo", () => {
		const today = buildToday(
			{
				now: NOW,
				week: weekOf(
					["a", "b", "c"].map((id) =>
						sessionOf(
							id,
							"2026-10-07T23:00:00.000Z",
							"2026-10-08T01:00:00.000Z",
						),
					),
				),
			},
			2,
		);

		expect(today.sessions.map((session) => session.sessionDocumentId)).toEqual([
			"a",
			"b",
		]);
		expect(today.overflow).toBe(1);
	});
});

const NO_COURSES: CourseAttention = {
	drafts: { courses: [], truncated: false },
	withoutTrainer: { courses: [], truncated: false },
};

const planSummaryOf = (
	overrides: Partial<CurrentPlanSummary> = {},
): CurrentPlanSummary => ({
	fiscalYear: 2026,
	plan: {
		documentId: "plan-26",
		progress: { done: 1, total: 4, cancelled: 0, ratio: 0.25 },
	},
	dueLines: [],
	dueTotal: 0,
	...overrides,
});

const attentionItemOf = (documentId: string) => ({
	documentId,
	title: `Curso ${documentId}`,
	updatedAt: new Date("2026-10-01T00:00:00.000Z"),
	firstSessionAt: null,
});

const NOTHING_MORE = {
	pendingFinish: false,
	withoutTrainer: false,
	overdueLine: false,
	draft: false,
};

describe("buildAttention", () => {
	test("sin pendientes no hay nada que resolver", () => {
		expect(
			buildAttention({
				pending: null,
				invitations: [invitationOf("tranquila", false)],
				courses: null,
				plan: null,
			}),
		).toEqual({ items: [], more: NOTHING_MORE });
	});

	test("ordena por finalizar, invitaciones que urgen, sin capacitador, líneas atrasadas y borradores", () => {
		const result = buildAttention({
			pending: { awaitingFinish: [pendingOf("archivo")], truncated: false },
			invitations: [
				invitationOf("urge", true),
				invitationOf("tranquila", false),
			],
			courses: {
				drafts: { courses: [attentionItemOf("borrador")], truncated: true },
				withoutTrainer: {
					courses: [attentionItemOf("huerfano")],
					truncated: true,
				},
			},
			plan: planSummaryOf({
				dueLines: [
					{ documentId: "l1", title: "Ética", plannedMonth: 8, overdue: true },
					{ documentId: "l2", title: "Word", plannedMonth: 10, overdue: false },
				],
				dueTotal: 2,
			}),
		});

		expect(result.items).toMatchObject([
			{ kind: "pendingFinish", href: "/dashboard/imparticion/archivo" },
			{
				kind: "invitation",
				courseDocumentId: "urge",
				href: "/dashboard/mis-capacitaciones/urge",
			},
			{
				kind: "withoutTrainer",
				courseDocumentId: "huerfano",
				href: "/dashboard/capacitaciones/huerfano",
			},
			{
				kind: "overdueLine",
				lineDocumentId: "l1",
				plannedMonth: 8,
				href: "/dashboard/capacitaciones/nuevo?linea=l1",
			},
			{
				kind: "draft",
				courseDocumentId: "borrador",
				href: "/dashboard/capacitaciones/borrador",
			},
		]);
		expect(result.more).toEqual({
			...NOTHING_MORE,
			withoutTrainer: true,
			draft: true,
		});
	});

	test("las líneas sin leer cuentan como posibles atrasadas solo si ya hay alguna", () => {
		const late = buildAttention({
			pending: null,
			invitations: [],
			courses: NO_COURSES,
			plan: planSummaryOf({
				dueLines: [
					{ documentId: "l1", title: "Ética", plannedMonth: 8, overdue: true },
				],
				dueTotal: 4,
			}),
		});
		expect(late.more.overdueLine).toBe(true);

		const onTime = buildAttention({
			pending: null,
			invitations: [],
			courses: NO_COURSES,
			plan: planSummaryOf({
				dueLines: [
					{
						documentId: "l1",
						title: "Ética",
						plannedMonth: 10,
						overdue: false,
					},
				],
				dueTotal: 4,
			}),
		});
		expect(onTime.items).toEqual([]);
		expect(onTime.more.overdueLine).toBe(false);
	});
});

const HEALTHY = {
	failedEmails: 0,
	stuckEmails: 0,
	recentJobFailures: 0,
	windowDays: 7,
};

const progressOf = (done: number, total: number, cancelled = 0) => {
	const active = total - cancelled;
	return { done, total, cancelled, ratio: active === 0 ? null : done / active };
};

const planOf = (
	documentId: string,
	dependencyName: string,
	progress: ReturnType<typeof progressOf>,
) => ({ documentId, dependencyName, progress });

describe("buildPlatformAttention", () => {
	test("todo en orden: no hay nada que resolver", () => {
		expect(
			buildPlatformAttention(
				{
					health: HEALTHY,
					withoutHead: [],
					coverage: { fiscalYear: 2026, plans: [], withoutPlan: [] },
				},
				4,
			),
		).toEqual({ items: [], overflow: 0 });
	});

	test("las fallas de operación van antes que las dependencias, y la falta de plan se anota en la dependencia", () => {
		const result = buildPlatformAttention(
			{
				health: {
					failedEmails: 2,
					stuckEmails: 1,
					recentJobFailures: 3,
					windowDays: 7,
				},
				withoutHead: [
					{ documentId: "dep-a", name: "Pruebas" },
					{ documentId: "dep-b", name: "Tesorería" },
				],
				coverage: {
					fiscalYear: 2026,
					plans: [],
					withoutPlan: [{ documentId: "dep-a", name: "Pruebas" }],
				},
			},
			4,
		);

		expect(result.items).toEqual([
			{ kind: "emails", failed: 2, stuck: 1 },
			{ kind: "jobs", failed: 3, windowDays: 7 },
			{
				kind: "withoutHead",
				dependency: { documentId: "dep-a", name: "Pruebas" },
				withoutPlan: true,
			},
			{
				kind: "withoutHead",
				dependency: { documentId: "dep-b", name: "Tesorería" },
				withoutPlan: false,
			},
		]);
	});

	test("solo los correos atrasados también piden revisar los correos", () => {
		const result = buildPlatformAttention(
			{
				health: { ...HEALTHY, stuckEmails: 1 },
				withoutHead: [],
				coverage: { fiscalYear: 2026, plans: [], withoutPlan: [] },
			},
			4,
		);

		expect(result.items).toEqual([{ kind: "emails", failed: 0, stuck: 1 }]);
	});

	test("recorta las dependencias al tope y cuenta las que no cupieron", () => {
		const withoutHead = ["a", "b", "c"].map((id) => ({
			documentId: id,
			name: id,
		}));
		const result = buildPlatformAttention(
			{
				health: { ...HEALTHY, recentJobFailures: 1 },
				withoutHead,
				coverage: { fiscalYear: 2026, plans: [], withoutPlan: [] },
			},
			2,
		);

		expect(result.items.map((item) => item.kind)).toEqual([
			"jobs",
			"withoutHead",
			"withoutHead",
		]);
		expect(result.overflow).toBe(1);
	});
});

describe("summarizeCoverage", () => {
	test("suma lo realizado sobre lo vigente de todos los planes, sin lo cancelado", () => {
		expect(
			summarizeCoverage({
				fiscalYear: 2026,
				plans: [
					planOf("p1", "Obras Públicas", progressOf(1, 4, 1)),
					planOf("p2", "Desarrollo Social", progressOf(1, 1)),
				],
				withoutPlan: [{ documentId: "dep-c", name: "Pruebas" }],
			}),
		).toEqual({
			done: 2,
			active: 4,
			ratio: 0.5,
			withPlan: 2,
			dependencies: 3,
		});
	});

	test("sin nada vigente no hay avance que medir", () => {
		expect(
			summarizeCoverage({
				fiscalYear: 2026,
				plans: [planOf("p1", "Obras Públicas", progressOf(0, 2, 2))],
				withoutPlan: [],
			}),
		).toMatchObject({ done: 0, active: 0, ratio: null });
	});
});

describe("sortPlansByProgress", () => {
	test("de menor a mayor avance, con los que no tienen nada vigente al final y empates por nombre", () => {
		const sorted = sortPlansByProgress([
			planOf("p1", "Tesorería", progressOf(0, 0)),
			planOf("p2", "Desarrollo Social", progressOf(1, 1)),
			planOf("p3", "Obras Públicas", progressOf(1, 3)),
			planOf("p4", "Bienestar", progressOf(1, 3)),
		]);

		expect(sorted.map((plan) => plan.documentId)).toEqual([
			"p4",
			"p3",
			"p2",
			"p1",
		]);
	});
});
