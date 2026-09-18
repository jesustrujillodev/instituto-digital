import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { CHECK_IN_ERROR_CODES } from "../check-in.errors";
import {
	assertActiveSession,
	assertCheckInOpen,
	assertEnrolled,
	type CheckInWindow,
	resolveSessionOutcome,
	windowOf,
} from "../check-in.rules";
import type { CheckInSession } from "../check-in.types";

const WINDOW: CheckInWindow = {
	opensBeforeMinutes: 15,
	closesAfterMinutes: 15,
};
const TIGHT: CheckInWindow = { opensBeforeMinutes: 0, closesAfterMinutes: 0 };

const sessionOf = (
	index: number,
	date: string,
	start = "09:00",
	end = "11:00",
): CheckInSession => ({
	id: index + 1,
	documentId: `session-${index}`,
	startsAt: zonedInputToUtc(date, start),
	endsAt: zonedInputToUtc(date, end),
	venue: null,
});

const codeOf = (fn: () => void): string => {
	try {
		fn();
	} catch (error) {
		return (error as { code: string }).code;
	}
	throw new Error("no lanzó");
};

describe("windowOf", () => {
	test("estira la ventana por los dos extremos", () => {
		const session = sessionOf(0, "2026-09-01");
		const { opensAt, closesAt } = windowOf(session, WINDOW);

		expect(opensAt).toEqual(zonedInputToUtc("2026-09-01", "08:45"));
		expect(closesAt).toEqual(zonedInputToUtc("2026-09-01", "11:15"));
	});

	test("sin tolerancia la ventana es el horario exacto", () => {
		const session = sessionOf(0, "2026-09-01");
		const { opensAt, closesAt } = windowOf(session, TIGHT);

		expect(opensAt).toEqual(session.startsAt);
		expect(closesAt).toEqual(session.endsAt);
	});
});

describe("resolveSessionOutcome", () => {
	const sessions = [
		sessionOf(0, "2026-09-01"),
		sessionOf(1, "2026-09-02"),
		sessionOf(2, "2026-09-03"),
	];

	test("dentro del horario devuelve esa sesión", () => {
		const outcome = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-09-02", "10:00"),
		);

		expect(outcome).toMatchObject({ kind: "ACTIVE" });
		expect((outcome as { session: CheckInSession }).session.documentId).toBe(
			"session-1",
		);
	});

	test("los bordes de la ventana son inclusivos", () => {
		const opens = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-09-01", "08:45"),
		);
		const closes = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-09-01", "11:15"),
		);

		expect(opens.kind).toBe("ACTIVE");
		expect(closes.kind).toBe("ACTIVE");
	});

	test("un milisegundo antes de abrir todavía no cuenta", () => {
		const outcome = resolveSessionOutcome(
			sessions,
			WINDOW,
			new Date(zonedInputToUtc("2026-09-01", "08:45").getTime() - 1),
		);

		expect(outcome).toMatchObject({ kind: "TOO_EARLY" });
	});

	test("antes de todo anuncia cuándo abre la próxima", () => {
		const outcome = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-08-30", "10:00"),
		);

		expect(outcome).toMatchObject({
			kind: "TOO_EARLY",
			opensAt: zonedInputToUtc("2026-09-01", "08:45"),
		});
	});

	test("entre dos sesiones apunta a la siguiente, no a la pasada", () => {
		const outcome = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-09-01", "20:00"),
		);

		expect(outcome).toMatchObject({
			kind: "TOO_EARLY",
			opensAt: zonedInputToUtc("2026-09-02", "08:45"),
		});
	});

	test("después de todo anuncia cuándo cerró la última", () => {
		const outcome = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-09-10", "10:00"),
		);

		expect(outcome).toMatchObject({
			kind: "CLOSED",
			closedAt: zonedInputToUtc("2026-09-03", "11:15"),
		});
	});

	test("con ventanas solapadas gana la que abrió antes", () => {
		const sameDay = [
			sessionOf(0, "2026-09-01", "09:00", "11:00"),
			sessionOf(1, "2026-09-01", "11:10", "13:00"),
		];

		const outcome = resolveSessionOutcome(
			sameDay,
			WINDOW,
			zonedInputToUtc("2026-09-01", "11:05"),
		);

		expect((outcome as { session: CheckInSession }).session.documentId).toBe(
			"session-0",
		);
	});

	test("sin sesiones no hay nada que resolver", () => {
		expect(resolveSessionOutcome([], WINDOW, new Date())).toEqual({
			kind: "WITHOUT_SESSIONS",
		});
	});
});

describe("assertActiveSession", () => {
	const sessions = [sessionOf(0, "2026-09-01")];

	test("traduce cada desenlace a su error tipado", () => {
		const early = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-08-30", "10:00"),
		);
		const closed = resolveSessionOutcome(
			sessions,
			WINDOW,
			zonedInputToUtc("2026-09-05", "10:00"),
		);

		expect(codeOf(() => assertActiveSession(early))).toBe(
			CHECK_IN_ERROR_CODES.SESSION_NOT_OPEN,
		);
		expect(codeOf(() => assertActiveSession(closed))).toBe(
			CHECK_IN_ERROR_CODES.SESSION_CLOSED,
		);
		expect(
			codeOf(() => assertActiveSession({ kind: "WITHOUT_SESSIONS" })),
		).toBe(CHECK_IN_ERROR_CODES.WITHOUT_SESSIONS);
	});
});

describe("assertCheckInOpen", () => {
	test("solo un curso publicado admite escaneos", () => {
		expect(() => assertCheckInOpen({ status: "PUBLISHED" })).not.toThrow();

		for (const status of ["DRAFT", "FINISHED", "CANCELLED"] as const) {
			expect(codeOf(() => assertCheckInOpen({ status }))).toBe(
				CHECK_IN_ERROR_CODES.COURSE_NOT_OPEN,
			);
		}
	});
});

describe("assertEnrolled", () => {
	test("solo pasa quien está inscrito", () => {
		expect(() => assertEnrolled({ status: "ENROLLED" }, "c")).not.toThrow();
	});

	test("el invitado se distingue para poder enlazar su invitación", () => {
		expect(codeOf(() => assertEnrolled({ status: "INVITED" }, "c"))).toBe(
			CHECK_IN_ERROR_CODES.INVITATION_PENDING,
		);
	});

	test("sin inscripción o fuera de ella se rechaza igual", () => {
		expect(codeOf(() => assertEnrolled(null, "c"))).toBe(
			CHECK_IN_ERROR_CODES.NOT_ENROLLED,
		);

		for (const status of ["DECLINED", "WITHDRAWN"] as const) {
			expect(codeOf(() => assertEnrolled({ status }, "c"))).toBe(
				CHECK_IN_ERROR_CODES.NOT_ENROLLED,
			);
		}
	});
});
