import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CalendarSession,
	CalendarWeek,
} from "@/modules/calendar/domain/calendar.types";
import type { MyCourseInvitation } from "@/modules/enrollments/domain/enrollment-summary.types";
import type { PendingFinishCourse } from "@/modules/teaching/domain/teaching.types";
import {
	buildToday,
	hasTodayPanel,
	resolveDashboardFacets,
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
				pendingFinish: [],
				invitations: [],
			},
			6,
		);

		expect(today.items).toMatchObject([
			{
				kind: "session",
				sessionDocumentId: "en-curso",
				role: "teaching",
				inProgress: true,
				href: "/dashboard/imparticion/c-en-curso",
			},
			{
				kind: "session",
				sessionDocumentId: "tarde",
				role: "learning",
				inProgress: false,
				href: "/dashboard/mis-capacitaciones/c-tarde",
			},
		]);
	});

	test("las sesiones van primero, luego lo que falta finalizar y al final las invitaciones que urgen", () => {
		const today = buildToday(
			{
				now: NOW,
				week: weekOf([
					sessionOf(
						"hoy",
						"2026-10-07T23:00:00.000Z",
						"2026-10-08T01:00:00.000Z",
					),
				]),
				pendingFinish: [pendingOf("archivo")],
				invitations: [
					invitationOf("urge", true),
					invitationOf("tranquila", false),
				],
			},
			6,
		);

		expect(today.items.map((item) => item.kind)).toEqual([
			"session",
			"pendingFinish",
			"invitation",
		]);
		expect(today.items[1]).toMatchObject({
			href: "/dashboard/imparticion/archivo",
		});
		expect(today.items[2]).toMatchObject({ courseDocumentId: "urge" });
	});

	test("recorta al tope y cuenta lo que no cupo", () => {
		const today = buildToday(
			{
				now: NOW,
				week: weekOf([]),
				pendingFinish: ["a", "b", "c"].map(pendingOf),
				invitations: [],
			},
			2,
		);

		expect(today.items).toHaveLength(2);
		expect(today.overflow).toBe(1);
	});

	test("sin nada hoy, dice qué es lo próximo de la semana", () => {
		const today = buildToday(
			{
				now: NOW,
				week: weekOf([
					sessionOf(
						"ajena",
						"2026-10-08T15:00:00.000Z",
						"2026-10-08T16:00:00.000Z",
						{
							lenses: ["organizing"],
						},
					),
					sessionOf(
						"jueves",
						"2026-10-08T16:00:00.000Z",
						"2026-10-08T18:00:00.000Z",
						{
							lenses: ["teaching"],
						},
					),
				]),
				pendingFinish: [],
				invitations: [],
			},
			6,
		);

		expect(today.items).toEqual([]);
		expect(today.nextUp).toEqual({
			title: "Curso jueves",
			startsAt: new Date("2026-10-08T16:00:00.000Z"),
			role: "teaching",
		});
	});
});
