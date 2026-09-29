import { describe, expect, test } from "vitest";
import {
	ENROLLMENT_ERROR_CODES,
	EnrollmentRemoveClosedError,
	EnrollmentRemovedError,
} from "../enrollment.errors";
import {
	acceptsInvitations,
	assertNotRemoved,
	assertRemovable,
	assertSeatsFor,
	canParticipate,
	canSelfEnroll,
	canTransition,
	canWithdraw,
	classifyMyCourse,
	courseTimelineOf,
	enrollmentClosesAt,
	isEnrollmentOpen,
	isOverForParticipant,
	isRemoval,
	participantPermissionsOf,
	removalBlockerOf,
	seatsLeftOf,
} from "../enrollment.rules";

const FIRST_SESSION = new Date("2026-10-20T23:00:00.000Z");
const DEADLINE = new Date("2026-10-10T06:59:00.000Z");

const courseOf = (
	overrides: Partial<Parameters<typeof isEnrollmentOpen>[0]> = {},
) => ({
	status: "PUBLISHED" as const,
	format: "SCHEDULED" as const,
	enrollmentDeadline: null,
	enrollmentClosedAt: null,
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

	test("un calendarizado sin sesiones no tiene cierre y no está abierto", () => {
		const course = courseOf({ firstSessionAt: null });

		expect(enrollmentClosesAt(course)).toBeNull();
		expect(isEnrollmentOpen(course, new Date("2026-09-01"))).toBe(false);
	});

	// docs/adr/0011: no hay primera sesión que alcance el cierre.
	test("un autogestivo sin fecha límite no cierra y admite inscripciones", () => {
		const course = courseOf({ format: "SELF_PACED", firstSessionAt: null });

		expect(enrollmentClosesAt(course)).toBeNull();
		expect(isEnrollmentOpen(course, new Date("2030-01-01"))).toBe(true);
	});

	// docs/adr/0014: el cierre a mano manda sobre cualquier fecha.
	test("un autogestivo con las inscripciones cerradas no admite a nadie", () => {
		const course = courseOf({
			format: "SELF_PACED",
			firstSessionAt: null,
			enrollmentClosedAt: new Date("2026-09-01"),
		});

		expect(isEnrollmentOpen(course, new Date("2026-09-02"))).toBe(false);
		expect(
			isEnrollmentOpen({ ...course, enrollmentClosedAt: null }, new Date()),
		).toBe(true);
	});

	test("un autogestivo con fecha límite sí cierra en ella", () => {
		const course = courseOf({
			format: "SELF_PACED",
			firstSessionAt: null,
			enrollmentDeadline: DEADLINE,
		});

		expect(enrollmentClosesAt(course)).toEqual(DEADLINE);
		expect(isEnrollmentOpen(course, new Date("2026-10-11T00:00:00Z"))).toBe(
			false,
		);
	});
});

describe("acceptsInvitations", () => {
	test("solo un curso por invitación admite invitar", () => {
		expect(acceptsInvitations({ access: "INVITATION" })).toBe(true);
		expect(acceptsInvitations({ access: "PUBLIC" })).toBe(false);
		expect(acceptsInvitations({ access: "RESTRICTED" })).toBe(false);
	});
});

describe("canSelfEnroll", () => {
	test("un curso público o restringido admite inscripción propia", () => {
		expect(canSelfEnroll({ access: "PUBLIC" }, null)).toBe(true);
		expect(canSelfEnroll({ access: "RESTRICTED" }, "WITHDRAWN")).toBe(true);
	});

	// Verlo porque se administra o se imparte no es estar invitado.
	test("uno por invitación solo con una invitación pendiente", () => {
		expect(canSelfEnroll({ access: "INVITATION" }, "INVITED")).toBe(true);
		expect(canSelfEnroll({ access: "INVITATION" }, null)).toBe(false);
		expect(canSelfEnroll({ access: "INVITATION" }, "DECLINED")).toBe(false);
		expect(canSelfEnroll({ access: "INVITATION" }, "WITHDRAWN")).toBe(false);
	});
});

describe("canWithdraw", () => {
	test("antes de la primera sesión se permite", () => {
		expect(canWithdraw(courseOf(), new Date("2026-10-19"), false)).toBe(true);
	});

	test("desde que empieza la primera sesión ya no", () => {
		expect(canWithdraw(courseOf(), FIRST_SESSION, false)).toBe(false);
	});

	test("en un curso cancelado no hay baja", () => {
		expect(
			canWithdraw(
				courseOf({ status: "CANCELLED" }),
				new Date("2026-09-01"),
				false,
			),
		).toBe(false);
	});

	test("un autogestivo se deja cuando sea: no tiene inicio que proteger", () => {
		const course = courseOf({ format: "SELF_PACED", firstSessionAt: null });

		expect(canWithdraw(course, new Date("2030-01-01"), false)).toBe(true);
	});

	// Su crédito quedaría sin la inscripción que lo respalda.
	test("un autogestivo completado ya no se deja", () => {
		const course = courseOf({ format: "SELF_PACED", firstSessionAt: null });

		expect(canWithdraw(course, new Date("2030-01-01"), true)).toBe(false);
	});
});

describe("participantPermissionsOf", () => {
	const BEFORE = new Date("2026-10-01");
	const AFTER_CLOSE = new Date("2026-10-15");
	const publicCourse = courseOf({ enrollmentDeadline: DEADLINE });
	const permissions = (
		status: Parameters<typeof participantPermissionsOf>[1],
		overrides: {
			access?: "PUBLIC" | "INVITATION";
			completed?: boolean;
			removed?: boolean;
		} = {},
		now = BEFORE,
	) =>
		participantPermissionsOf(
			{ ...publicCourse, access: overrides.access ?? "PUBLIC" },
			status,
			overrides.completed ?? false,
			now,
			overrides.removed ?? false,
		);

	test("de baja con la inscripción abierta puede volver a inscribirse", () => {
		expect(permissions("WITHDRAWN")).toEqual({
			enroll: true,
			withdraw: false,
			accept: false,
			decline: false,
		});
	});

	test("dado de baja por quien organiza no vuelve solo aunque siga abierto", () => {
		expect(permissions("WITHDRAWN", { removed: true }).enroll).toBe(false);
	});

	test("de baja de un curso por invitación ya no puede volver solo", () => {
		expect(permissions("WITHDRAWN", { access: "INVITATION" }).enroll).toBe(
			false,
		);
	});

	test("inscrito puede darse de baja, no inscribirse de nuevo", () => {
		expect(permissions("ENROLLED")).toMatchObject({
			enroll: false,
			withdraw: true,
		});
	});

	test("con el autogestivo completado ya no hay baja", () => {
		const selfPaced = {
			...courseOf({ format: "SELF_PACED", firstSessionAt: null }),
			access: "PUBLIC" as const,
		};

		expect(
			participantPermissionsOf(selfPaced, "ENROLLED", true, BEFORE, false)
				.withdraw,
		).toBe(false);
	});

	test("con la inscripción cerrada, la invitación solo se rechaza", () => {
		expect(permissions("INVITED", {}, AFTER_CLOSE)).toEqual({
			enroll: false,
			withdraw: false,
			accept: false,
			decline: true,
		});
	});
});

describe("isOverForParticipant", () => {
	test.each([
		["FINISHED", "SCHEDULED", false, true],
		["PUBLISHED", "SCHEDULED", true, false],
		["PUBLISHED", "SELF_PACED", true, true],
		["PUBLISHED", "SELF_PACED", false, false],
	] as const)("%s %s completado=%s → %s", (status, format, completed, over) => {
		expect(isOverForParticipant({ status, format }, completed)).toBe(over);
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
		format: "SCHEDULED" as const,
		firstSessionAt: new Date("2026-10-01T16:00:00Z"),
		lastSessionEndsAt: new Date("2026-10-08T20:00:00Z"),
	};

	test("antes de empezar es próximo", () => {
		expect(classifyMyCourse(window, new Date("2026-09-30"), false)).toBe(
			"upcoming",
		);
	});

	test("entre la primera y la última sesión está en curso", () => {
		expect(classifyMyCourse(window, new Date("2026-10-03"), false)).toBe(
			"inProgress",
		);
	});

	test("tras la última sesión está finalizado", () => {
		expect(classifyMyCourse(window, new Date("2026-10-09"), false)).toBe(
			"finished",
		);
	});

	test.each(["FINISHED", "CANCELLED"] as const)(
		"un curso %s va a finalizados aunque no haya empezado",
		(status) => {
			expect(
				classifyMyCourse({ ...window, status }, new Date("2026-09-01"), false),
			).toBe("finished");
		},
	);

	// Nada está por venir: se recorre desde el día que uno se inscribe.
	test("un autogestivo publicado está en curso", () => {
		const course = {
			...window,
			format: "SELF_PACED" as const,
			firstSessionAt: null,
			lastSessionEndsAt: null,
		};

		expect(classifyMyCourse(course, new Date("2030-01-01"), false)).toBe(
			"inProgress",
		);
		expect(
			classifyMyCourse({ ...course, status: "FINISHED" }, new Date(), false),
		).toBe("finished");
	});

	// No se cierra nunca: para quien lo cursa termina cuando lo completa.
	test("un autogestivo completado pasa a finalizados", () => {
		const course = {
			...window,
			format: "SELF_PACED" as const,
			firstSessionAt: null,
			lastSessionEndsAt: null,
		};

		expect(classifyMyCourse(course, new Date("2030-01-01"), true)).toBe(
			"finished",
		);
	});
});

describe("courseTimelineOf", () => {
	const sessionOf = (startsAt: string, endsAt: string) => ({
		documentId: startsAt,
		startsAt: new Date(startsAt),
		endsAt: new Date(endsAt),
		venue: null,
		link: null,
	});
	// 9:00–11:00 y 16:00–18:00 en Tijuana (UTC−7).
	const sessions = [
		sessionOf("2026-10-02T16:00:00Z", "2026-10-02T18:00:00Z"),
		sessionOf("2026-10-05T23:00:00Z", "2026-10-06T01:00:00Z"),
	];

	test("antes de empezar cuenta días naturales en la zona del instituto", () => {
		// 22:00 del 25 de septiembre en Tijuana: faltan 7 días, no 6.
		const timeline = courseTimelineOf(
			{ sessions },
			new Date("2026-09-26T05:00:00Z"),
		);

		expect(timeline).toMatchObject({ sessionsHeld: 0, daysToStart: 7 });
		expect(timeline.nextSession?.documentId).toBe(sessions[0].documentId);
	});

	test("entre sesiones cuenta las que ya terminaron y da la siguiente", () => {
		const timeline = courseTimelineOf(
			{ sessions },
			new Date("2026-10-03T12:00:00Z"),
		);

		expect(timeline).toMatchObject({ sessionsHeld: 1, daysToStart: null });
		expect(timeline.nextSession?.documentId).toBe(sessions[1].documentId);
	});

	test("una sesión en curso sigue siendo la próxima", () => {
		const timeline = courseTimelineOf(
			{ sessions },
			new Date("2026-10-02T17:00:00Z"),
		);

		expect(timeline.sessionsHeld).toBe(0);
		expect(timeline.nextSession?.documentId).toBe(sessions[0].documentId);
	});

	test("sin sesiones no hay fechas", () => {
		expect(courseTimelineOf({ sessions: [] }, new Date())).toEqual({
			sessionsHeld: 0,
			nextSession: null,
			daysToStart: null,
		});
	});
});

describe("isRemoval", () => {
	test("solo es baja de quien organiza si la hizo otra persona", () => {
		expect(isRemoval({ status: "WITHDRAWN", userId: 20, actedById: 3 })).toBe(
			true,
		);
		expect(isRemoval({ status: "WITHDRAWN", userId: 20, actedById: 20 })).toBe(
			false,
		);
		expect(isRemoval({ status: "ENROLLED", userId: 20, actedById: 3 })).toBe(
			false,
		);
	});
});

describe("removalBlockerOf / assertRemovable", () => {
	test("en un curso publicado se da de baja a quien no lo completó", () => {
		expect(removalBlockerOf({ status: "PUBLISHED" }, false)).toBeNull();
		expect(() => assertRemovable({ status: "PUBLISHED" }, false)).not.toThrow();
	});

	// A diferencia de la baja voluntaria, empezar el curso no la cierra.
	test("un curso ya empezado sigue admitiendo la baja", () => {
		expect(removalBlockerOf({ status: "PUBLISHED" }, false)).toBeNull();
	});

	test("un finalizado o un borrador no admiten baja", () => {
		for (const status of ["FINISHED", "DRAFT", "CANCELLED"] as const) {
			expect(removalBlockerOf({ status }, false)).toBe("NOT_PUBLISHED");
		}
	});

	test("quien completó conserva su inscripción", () => {
		expect(removalBlockerOf({ status: "PUBLISHED" }, true)).toBe("COMPLETED");
	});

	test("el error lleva un código estable y el motivo", () => {
		try {
			assertRemovable({ status: "PUBLISHED" }, true);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(EnrollmentRemoveClosedError);
			expect((error as EnrollmentRemoveClosedError).code).toBe(
				ENROLLMENT_ERROR_CODES.REMOVE_CLOSED,
			);
			expect((error as EnrollmentRemoveClosedError).details).toEqual({
				reason: "COMPLETED",
			});
		}
	});
});

describe("assertNotRemoved", () => {
	test("la baja de quien organiza corta la reinscripción propia", () => {
		expect(() => assertNotRemoved({ removed: true })).toThrow(
			EnrollmentRemovedError,
		);
		expect(() => assertNotRemoved({ removed: false })).not.toThrow();
		expect(() => assertNotRemoved(null)).not.toThrow();
	});
});
