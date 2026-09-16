import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CALENDAR_ERROR_CODES } from "../../domain/calendar.errors";
import type { FindCalendarSessionsParams } from "../../domain/calendar.repository";
import type {
	CalendarQueryDto,
	CalendarSessionRow,
} from "../../domain/calendar.types";
import { createCalendarService } from "../calendar.service.server";

const NOW = new Date("2026-10-01T05:00:00.000Z");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const actorOf = (overrides: Partial<AuthContext> = {}): AuthContext => ({
	userId: 50,
	documentId: "99999999-9999-4999-8999-999999999999",
	email: "miguel.sds@instituto.gob.mx",
	role: "USER",
	dependencyId: 4,
	isTrainer: false,
	...overrides,
});

const queryOf = (
	overrides: Partial<CalendarQueryDto> = {},
): CalendarQueryDto => ({
	view: "month",
	staff: false,
	...overrides,
});

const rowOf = (
	documentId: string,
	overrides: Partial<CalendarSessionRow> = {},
): CalendarSessionRow => ({
	documentId,
	startsAt: new Date("2026-10-20T23:00:00.000Z"),
	endsAt: new Date("2026-10-21T02:00:00.000Z"),
	venue: "Sala B",
	link: null,
	course: {
		documentId: `c-${documentId}`,
		title: "Atención ciudadana",
		modality: "IN_PERSON",
		status: "PUBLISHED",
		dependencyId: 4,
		createdById: 9,
		dependency: { documentId: "d-sds", name: "SEDESOL" },
	},
	trainers: [
		{
			userId: 8,
			documentId: "t-diana",
			firstName: "Diana",
			lastName: "Sánchez",
			email: "diana.sds@instituto.gob.mx",
		},
	],
	viewerStatus: "ENROLLED",
	staffEnrolled: false,
	...overrides,
});

const createHarness = (rows: CalendarSessionRow[] | Error = [rowOf("s1")]) => {
	const calls = { find: [] as FindCalendarSessionsParams[] };

	const calendarRepository = {
		findSessions: async (params: FindCalendarSessionsParams) => {
			calls.find.push(params);
			if (rows instanceof Error) throw rows;
			return rows;
		},
	} as unknown as ICradle["calendarRepository"];

	const service = createCalendarService({
		calendarRepository,
		clock: { now: () => NOW },
		logger: silentLogger,
	});

	return { service, calls };
};

describe("listSessions", () => {
	test("sin mes, consulta el mes en curso de Tijuana con su cuadrícula", async () => {
		const { service, calls } = createHarness();

		const result = await service.listSessions(queryOf(), actorOf());

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.period.month).toBe("2026-09");
		expect(calls.find[0].from.toISOString()).toBe("2026-08-31T07:00:00.000Z");
		expect(calls.find[0].to.toISOString()).toBe("2026-10-05T07:00:00.000Z");
	});

	test("etiqueta cada sesión y le asigna su detalle", async () => {
		const { service } = createHarness();

		const result = await service.listSessions(
			queryOf({ month: "2026-10" }),
			actorOf(),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.sessions).toEqual([
			expect.objectContaining({
				documentId: "s1",
				lenses: ["enrolled"],
				courseHref: "/dashboard/cursos-disponibles/c-s1",
			}),
		]);
	});

	test("descarta filas que no le corresponden al visor", async () => {
		const { service } = createHarness([
			rowOf("s1"),
			rowOf("s2", { viewerStatus: null, trainers: [] }),
		]);

		const result = await service.listSessions(queryOf(), actorOf());

		expect(result.success && result.data.sessions).toHaveLength(1);
	});

	test("el filtro de personal solo llega al repositorio para titular o auxiliar", async () => {
		const participant = createHarness();
		await participant.service.listSessions(queryOf({ staff: true }), actorOf());
		expect(participant.calls.find[0].staffDependencyId).toBeNull();

		const head = createHarness();
		const result = await head.service.listSessions(
			queryOf({ staff: true }),
			actorOf({ role: "DEPENDENCY_HEAD" }),
		);
		expect(head.calls.find[0].staffDependencyId).toBe(4);
		expect(result.success && result.data.filters.staff).toBe(true);
		expect(result.success && result.data.options.canToggleStaff).toBe(true);
	});

	test("las opciones no se reducen al filtrar", async () => {
		const { service } = createHarness([
			rowOf("s1"),
			rowOf("s2", {
				trainers: [
					{
						userId: 12,
						documentId: "t-elena",
						firstName: "Elena",
						lastName: "Torres",
						email: "elena.torres@universidad.mx",
					},
				],
			}),
		]);

		const result = await service.listSessions(
			queryOf({ trainer: "t-elena" }),
			actorOf(),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.sessions.map((session) => session.documentId)).toEqual([
			"s2",
		]);
		expect(result.data.options.trainers).toHaveLength(2);
	});

	test("un mes fuera de rango responde su código sin tocar la base", async () => {
		const { service, calls } = createHarness();

		const result = await service.listSessions(
			queryOf({ month: "2026-13" }),
			actorOf(),
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(CALENDAR_ERROR_CODES.INVALID_MONTH);
		expect(calls.find).toHaveLength(0);
	});

	test("un fallo del repositorio llega como error inesperado", async () => {
		const { service } = createHarness(new Error("connection refused"));

		const result = await service.listSessions(queryOf(), actorOf());

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(RESPONSE_ERROR_CODES.UNEXPECTED);
	});
});
