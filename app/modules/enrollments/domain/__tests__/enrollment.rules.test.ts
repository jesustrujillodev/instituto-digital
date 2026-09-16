import { describe, expect, test } from "vitest";
import { ENROLLMENT_ERROR_CODES } from "../enrollment.errors";
import {
	assertSeatsFor,
	canParticipate,
	canTransition,
	canWithdraw,
	classifyMyCourse,
	enrollmentClosesAt,
	isEnrollmentOpen,
	seatsLeftOf,
} from "../enrollment.rules";

const FIRST_SESSION = new Date("2026-10-20T23:00:00.000Z");
const DEADLINE = new Date("2026-10-10T06:59:00.000Z");

const courseOf = (
	overrides: Partial<Parameters<typeof isEnrollmentOpen>[0]> = {},
) => ({
	status: "PUBLISHED" as const,
	enrollmentDeadline: null,
	firstSessionAt: FIRST_SESSION,
	...overrides,
});

describe("canParticipate", () => {
	test.each([
		["USER", 3, true],
		["DEPENDENCY_HEAD", 3, true],
		["DEPENDENCY_DEPUTY", 3, true],
		["USER", null, false],
		["SUPERADMIN", 3, false],
		["ADMIN", null, false],
	] as const)("%s con dependencia %s → %s", (role, dependencyId, expected) => {
		expect(canParticipate({ role, dependencyId })).toBe(expected);
	});
});

describe("enrollmentClosesAt e isEnrollmentOpen", () => {
	test("sin fecha límite cierra al empezar la primera sesión", () => {
		const course = courseOf();

		expect(enrollmentClosesAt(course)).toEqual(FIRST_SESSION);
		expect(isEnrollmentOpen(course, new Date("2026-10-20T22:59:00Z"))).toBe(
			true,
		);
		expect(isEnrollmentOpen(course, FIRST_SESSION)).toBe(false);
	});

	test("con fecha límite cierra en ella aunque la sesión sea después", () => {
		const course = courseOf({ enrollmentDeadline: DEADLINE });

		expect(enrollmentClosesAt(course)).toEqual(DEADLINE);
		expect(isEnrollmentOpen(course, new Date("2026-10-11T00:00:00Z"))).toBe(
			false,
		);
	});

	test.each(["DRAFT", "FINISHED", "CANCELLED"] as const)(
		"un curso %s no admite inscripciones",
		(status) => {
			expect(
				isEnrollmentOpen(courseOf({ status }), new Date("2026-09-01")),
			).toBe(false);
		},
	);

	test("sin sesiones no hay cierre y no está abierto", () => {
		const course = courseOf({ firstSessionAt: null });

		expect(enrollmentClosesAt(course)).toBeNull();
		expect(isEnrollmentOpen(course, new Date("2026-09-01"))).toBe(false);
	});
});

describe("canWithdraw", () => {
	test("antes de la primera sesión se permite", () => {
		expect(canWithdraw(courseOf(), new Date("2026-10-19"))).toBe(true);
	});

	test("desde que empieza la primera sesión ya no", () => {
		expect(canWithdraw(courseOf(), FIRST_SESSION)).toBe(false);
	});

	test("en un curso cancelado no hay baja", () => {
		expect(
			canWithdraw(courseOf({ status: "CANCELLED" }), new Date("2026-09-01")),
		).toBe(false);
	});
});

describe("cupo", () => {
	test("seatsLeftOf es null sin cupo y nunca negativo", () => {
		expect(seatsLeftOf(null, 40)).toBeNull();
		expect(seatsLeftOf(5, 3)).toBe(2);
		expect(seatsLeftOf(2, 3)).toBe(0);
	});

	test("assertSeatsFor deja pasar hasta llenar", () => {
		expect(() => assertSeatsFor(2, 1, 1)).not.toThrow();
		expect(() => assertSeatsFor(null, 500, 20)).not.toThrow();
	});

	test("assertSeatsFor falla con los lugares que quedan", () => {
		expect(() => assertSeatsFor(3, 2, 2)).toThrow(
			expect.objectContaining({
				code: ENROLLMENT_ERROR_CODES.FULL,
				details: { seatsLeft: 1 },
			}),
		);
	});
});

describe("canTransition", () => {
	test.each([
		[null, "INVITED", true],
		[null, "ENROLLED", true],
		[null, "WITHDRAWN", false],
		["INVITED", "ENROLLED", true],
		["INVITED", "DECLINED", true],
		["INVITED", "WITHDRAWN", false],
		["ENROLLED", "WITHDRAWN", true],
		["ENROLLED", "ENROLLED", false],
		["ENROLLED", "INVITED", false],
		["DECLINED", "INVITED", true],
		["DECLINED", "ENROLLED", true],
		["WITHDRAWN", "ENROLLED", true],
		["WITHDRAWN", "DECLINED", false],
	] as const)("%s → %s = %s", (from, to, expected) => {
		expect(canTransition(from, to)).toBe(expected);
	});
});

describe("classifyMyCourse", () => {
	const window = {
		status: "PUBLISHED" as const,
		firstSessionAt: new Date("2026-10-01T16:00:00Z"),
		lastSessionEndsAt: new Date("2026-10-08T20:00:00Z"),
	};

	test("antes de empezar es próximo", () => {
		expect(classifyMyCourse(window, new Date("2026-09-30"))).toBe("upcoming");
	});

	test("entre la primera y la última sesión está en curso", () => {
		expect(classifyMyCourse(window, new Date("2026-10-03"))).toBe("inProgress");
	});

	test("tras la última sesión está finalizado", () => {
		expect(classifyMyCourse(window, new Date("2026-10-09"))).toBe("finished");
	});

	test.each(["FINISHED", "CANCELLED"] as const)(
		"un curso %s va a finalizados aunque no haya empezado",
		(status) => {
			expect(
				classifyMyCourse({ ...window, status }, new Date("2026-09-01")),
			).toBe("finished");
		},
	);
});
