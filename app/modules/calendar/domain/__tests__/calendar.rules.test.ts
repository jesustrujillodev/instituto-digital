import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { CALENDAR_ERROR_CODES } from "../calendar.errors";
import {
	applyCalendarFilters,
	canToggleStaff,
	currentMonth,
	filterOptionsOf,
	lensesOf,
	monthGridDays,
	parseMonth,
	periodRange,
	resolveCalendarPlan,
	resolveCourseHref,
	shiftMonth,
	toCalendarPeriod,
	toCalendarSessions,
	zonedDayOf,
} from "../calendar.rules";
import type { CalendarPlan, CalendarSessionRow } from "../calendar.types";

const SOP = 3;
const SDS = 4;
const VIEWER = 50;

const actorOf = (overrides: Partial<AuthContext> = {}) => ({
	userId: VIEWER,
	role: "USER" as AuthContext["role"],
	dependencyId: SOP as number | null,
	isTrainer: false,
	...overrides,
});

const rowOf = (
	overrides: Partial<Omit<CalendarSessionRow, "course">> & {
		course?: Partial<CalendarSessionRow["course"]>;
	} = {},
): CalendarSessionRow => {
	const { course, ...rest } = overrides;
	return {
		documentId: "s1",
		startsAt: new Date("2026-10-20T16:00:00.000Z"),
		endsAt: new Date("2026-10-20T19:00:00.000Z"),
		venue: "Sala B",
		link: null,
		trainers: [],
		viewerStatus: null,
		staffEnrolled: false,
		...rest,
		course: {
			documentId: "c1",
			title: "Atención ciudadana",
			modality: "IN_PERSON",
			status: "PUBLISHED",
			dependencyId: SDS,
			createdById: 900,
			dependency: { documentId: "d-sds", name: "SEDESOL" },
			...course,
		},
	};
};

const trainer = (userId: number, documentId = `t${userId}`) => ({
	userId,
	documentId,
	firstName: "Elena",
	lastName: "Torres",
	email: "elena@example.com",
});

describe("resolveCalendarPlan", () => {
	test("un participante cursa y no organiza", () => {
		const plan = resolveCalendarPlan(actorOf(), false);

		expect(plan.participates).toBe(true);
		expect(plan.organizer).toEqual({ kind: "none" });
		expect(canToggleStaff(plan)).toBe(false);
	});

	test("un capacitador interno organiza lo que creó", () => {
		const plan = resolveCalendarPlan(actorOf({ isTrainer: true }), false);

		expect(plan.organizer).toEqual({
			kind: "creator",
			dependencyId: SOP,
			userId: VIEWER,
		});
	});

	test("un capacitador externo ni cursa ni organiza", () => {
		const plan = resolveCalendarPlan(
			actorOf({ dependencyId: null, isTrainer: true }),
			true,
		);

		expect(plan.participates).toBe(false);
		expect(plan.organizer).toEqual({ kind: "none" });
		expect(plan.staffDependencyId).toBeNull();
	});

	test("el titular consulta a su personal solo si lo pide", () => {
		const head = actorOf({ role: "DEPENDENCY_HEAD" });

		expect(resolveCalendarPlan(head, false).staffDependencyId).toBeNull();
		expect(resolveCalendarPlan(head, true).staffDependencyId).toBe(SOP);
		expect(canToggleStaff(resolveCalendarPlan(head, false))).toBe(true);
	});

	test("el superadministrador ve todo, no cursa y no tiene personal", () => {
		const plan = resolveCalendarPlan(
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
			true,
		);

		expect(plan.organizer).toEqual({ kind: "global" });
		expect(plan.participates).toBe(false);
		expect(plan.staffDependencyId).toBeNull();
	});
});

describe("lensesOf", () => {
	const participant = resolveCalendarPlan(actorOf(), false);

	test("inscrito", () => {
		expect(lensesOf(participant, rowOf({ viewerStatus: "ENROLLED" }))).toEqual([
			"enrolled",
		]);
	});

	test("la invitación solo cuenta mientras el curso está publicado", () => {
		expect(lensesOf(participant, rowOf({ viewerStatus: "INVITED" }))).toEqual([
			"invited",
		]);
		expect(
			lensesOf(
				participant,
				rowOf({ viewerStatus: "INVITED", course: { status: "FINISHED" } }),
			),
		).toEqual([]);
	});

	test("un curso finalizado sigue apareciendo a quien lo cursó", () => {
		expect(
			lensesOf(
				participant,
				rowOf({ viewerStatus: "ENROLLED", course: { status: "FINISHED" } }),
			),
		).toEqual(["enrolled"]);
	});

	test("imparte aunque su perfil esté desactivado: no depende del claim", () => {
		expect(
			lensesOf(participant, rowOf({ trainers: [trainer(VIEWER)] })),
		).toEqual(["teaching"]);
	});

	test("un borrador no aparece a quien solo lo imparte", () => {
		expect(
			lensesOf(
				participant,
				rowOf({ trainers: [trainer(VIEWER)], course: { status: "DRAFT" } }),
			),
		).toEqual([]);
	});

	test("un cancelado no aparece por ningún lente", () => {
		const head = resolveCalendarPlan(
			actorOf({ role: "DEPENDENCY_HEAD", dependencyId: SDS }),
			true,
		);

		expect(
			lensesOf(
				head,
				rowOf({
					viewerStatus: "ENROLLED",
					trainers: [trainer(VIEWER)],
					staffEnrolled: true,
					course: { status: "CANCELLED" },
				}),
			),
		).toEqual([]);
	});

	test("el titular ve los borradores de su dependencia", () => {
		const head = resolveCalendarPlan(
			actorOf({ role: "DEPENDENCY_HEAD", dependencyId: SDS }),
			false,
		);

		expect(lensesOf(head, rowOf({ course: { status: "DRAFT" } }))).toEqual([
			"organizing",
		]);
	});

	test("el capacitador interno organiza solo lo que creó", () => {
		const creator = resolveCalendarPlan(
			actorOf({ isTrainer: true, dependencyId: SDS }),
			false,
		);

		expect(
			lensesOf(creator, rowOf({ course: { createdById: VIEWER } })),
		).toEqual(["organizing"]);
		expect(lensesOf(creator, rowOf())).toEqual([]);
	});

	test("personal inscrito, solo con el interruptor", () => {
		const head = actorOf({ role: "DEPENDENCY_HEAD" });

		expect(
			lensesOf(resolveCalendarPlan(head, true), rowOf({ staffEnrolled: true })),
		).toEqual(["staff"]);
		expect(
			lensesOf(
				resolveCalendarPlan(head, false),
				rowOf({ staffEnrolled: true }),
			),
		).toEqual([]);
	});

	test("el superadministrador ve también los borradores", () => {
		const superadmin = resolveCalendarPlan(
			actorOf({ role: "SUPERADMIN", dependencyId: null }),
			false,
		);

		expect(
			lensesOf(superadmin, rowOf({ course: { status: "DRAFT" } })),
		).toEqual(["global"]);
	});

	test("los roles se acumulan en una sola sesión", () => {
		const deputyTrainer = resolveCalendarPlan(
			actorOf({
				role: "DEPENDENCY_DEPUTY",
				dependencyId: SDS,
				isTrainer: true,
			}),
			false,
		);

		expect(
			lensesOf(
				deputyTrainer,
				rowOf({ viewerStatus: "ENROLLED", trainers: [trainer(VIEWER)] }),
			),
		).toEqual(["enrolled", "teaching", "organizing"]);
	});
});

describe("resolveCourseHref", () => {
	const participant = resolveCalendarPlan(actorOf(), false);
	const external = resolveCalendarPlan(
		actorOf({ dependencyId: null, isTrainer: true }),
		false,
	);

	test.each([
		[["organizing", "enrolled"], participant, "/dashboard/cursos/c1/editar"],
		[["global"], participant, "/dashboard/cursos/c1/editar"],
		[["enrolled"], participant, "/dashboard/cursos-disponibles/c1"],
		[["invited"], participant, "/dashboard/cursos-disponibles/c1"],
		[["teaching"], participant, "/dashboard/cursos-disponibles/c1"],
		[["teaching"], external, null],
		[["staff"], participant, null],
	] as const)("%j lleva a %s", (lenses, plan: CalendarPlan, expected) => {
		expect(resolveCourseHref(lenses, "c1", plan)).toBe(expected);
	});
});

describe("toCalendarSessions", () => {
	test("descarta las filas sin lente y compone el nombre del capacitador", () => {
		const plan = resolveCalendarPlan(actorOf(), false);
		const sessions = toCalendarSessions(plan, [
			rowOf({ viewerStatus: "ENROLLED", trainers: [trainer(8)] }),
			rowOf({ documentId: "s2" }),
		]);

		expect(sessions).toHaveLength(1);
		expect(sessions[0].trainers).toEqual([
			{ documentId: "t8", name: "Elena Torres" },
		]);
		expect(sessions[0].courseHref).toBe("/dashboard/cursos-disponibles/c1");
	});

	test("sin nombre, el capacitador se muestra por su correo", () => {
		const plan = resolveCalendarPlan(actorOf(), false);
		const [session] = toCalendarSessions(plan, [
			rowOf({
				viewerStatus: "ENROLLED",
				trainers: [{ ...trainer(8), firstName: null, lastName: null }],
			}),
		]);

		expect(session.trainers[0].name).toBe("elena@example.com");
	});
});

describe("filtros", () => {
	const plan = resolveCalendarPlan(
		actorOf({ role: "SUPERADMIN", dependencyId: null }),
		false,
	);
	const sessions = toCalendarSessions(plan, [
		rowOf({ trainers: [trainer(8, "t-elena")] }),
		rowOf({
			documentId: "s2",
			course: {
				modality: "ONLINE",
				dependencyId: SOP,
				dependency: { documentId: "d-sop", name: "Obras Públicas" },
			},
		}),
	]);

	test("las opciones salen de lo visible, sin repetir y en orden", () => {
		expect(filterOptionsOf([...sessions, ...sessions])).toEqual({
			dependencies: [
				{ documentId: "d-sop", name: "Obras Públicas" },
				{ documentId: "d-sds", name: "SEDESOL" },
			],
			trainers: [{ documentId: "t-elena", name: "Elena Torres" }],
		});
	});

	test.each([
		[{ dependency: "d-sop" }, ["s2"]],
		[{ modality: "IN_PERSON" as const }, ["s1"]],
		[{ trainer: "t-elena" }, ["s1"]],
		[{}, ["s1", "s2"]],
	])("%j", (patch, expected) => {
		const filtered = applyCalendarFilters(sessions, {
			dependency: null,
			modality: null,
			trainer: null,
			staff: false,
			...patch,
		});

		expect(filtered.map((session) => session.documentId)).toEqual(expected);
	});
});

describe("periodo", () => {
	test("el mes en curso se lee en Tijuana, no en UTC", () => {
		// 1 oct 05:00 UTC es todavía 30 de septiembre en Tijuana.
		expect(currentMonth(new Date("2026-10-01T05:00:00.000Z"))).toBe("2026-09");
	});

	test.each([
		["2026-12", 1, "2027-01"],
		["2026-01", -1, "2025-12"],
		["2026-10", 0, "2026-10"],
	])("shiftMonth(%s, %i) = %s", (month, delta, expected) => {
		expect(shiftMonth(month, delta)).toBe(expected);
	});

	test.each(["2026-13", "2026-00", "1999-12", "2101-01"])(
		"%s no es un mes válido",
		(month) => {
			expect(() => parseMonth(month)).toThrow(
				expect.objectContaining({ code: CALENDAR_ERROR_CODES.INVALID_MONTH }),
			);
		},
	);

	test("la cuadrícula empieza en lunes y cubre semanas completas", () => {
		const days = monthGridDays("2026-10");

		expect(days[0]).toBe("2026-09-28");
		expect(days.at(-1)).toBe("2026-11-01");
		expect(days).toHaveLength(35);
	});

	test("un mes que empieza en lunes y dura cuatro semanas no añade días", () => {
		const days = monthGridDays("2027-02");

		expect(days[0]).toBe("2027-02-01");
		expect(days).toHaveLength(28);
	});

	test("el rango convierte cada extremo con el horario de su fecha", () => {
		// Noviembre: la cuadrícula empieza el 26 de octubre, todavía en horario de
		// verano (UTC-7), y termina en diciembre, ya en horario estándar (UTC-8).
		const { from, to } = periodRange(toCalendarPeriod("2026-11"));

		expect(from.toISOString()).toBe("2026-10-26T07:00:00.000Z");
		expect(to.toISOString()).toBe("2026-12-07T08:00:00.000Z");
	});

	test("el día de una sesión nocturna es el de Tijuana", () => {
		expect(zonedDayOf(new Date("2026-11-18T05:30:00.000Z"))).toBe("2026-11-17");
	});

	test("el periodo trae los meses vecinos", () => {
		expect(toCalendarPeriod("2026-01")).toMatchObject({
			previousMonth: "2025-12",
			nextMonth: "2026-02",
		});
	});
});
