import { describe, expect, test } from "vitest";
import { COURSE_MAX_SESSIONS } from "../course.config";
import { COURSE_ERROR_CODES } from "../course.errors";
import {
	assertCapacityCovers,
	assertDeadlineBeforeStart,
	assertPublishable,
	assertSessionLimit,
	assertSessionRange,
	type CourseStatus,
	canCancel,
	canEdit,
	canPublish,
	publishChecklist,
	requiresLink,
	requiresVenue,
} from "../course.rules";

type PublishableCourse = Parameters<typeof assertPublishable>[0];

const sessionOf = (
	overrides: Partial<{ venue: string | null; link: string | null }> = {},
) => ({
	venue: "Sala A",
	link: null,
	...overrides,
});

const courseOf = (
	overrides: Partial<PublishableCourse> = {},
): PublishableCourse => ({
	status: "DRAFT",
	modality: "IN_PERSON",
	access: "PUBLIC",
	sessions: [sessionOf()],
	trainers: [{ isActive: true }],
	audience: { dependencies: [], groups: [] },
	...overrides,
});

const codeOf = (code: string) => expect.objectContaining({ code });

describe("transiciones de estado", () => {
	test.each<[CourseStatus, boolean]>([
		["DRAFT", true],
		["PUBLISHED", true],
		["FINISHED", false],
		["CANCELLED", false],
	])("canEdit(%s) = %s", (status, expected) => {
		expect(canEdit(status)).toBe(expected);
		// Cancelar y editar comparten condición: mientras el curso siga vivo.
		expect(canCancel(status)).toBe(expected);
	});

	test("solo se publica desde borrador", () => {
		expect(canPublish("DRAFT")).toBe(true);
		expect(canPublish("PUBLISHED")).toBe(false);
		expect(canPublish("CANCELLED")).toBe(false);
	});
});

describe("modalidad", () => {
	test("la presencial pide sede y la híbrida pide las dos", () => {
		expect(requiresVenue("IN_PERSON")).toBe(true);
		expect(requiresLink("IN_PERSON")).toBe(false);
		expect(requiresVenue("ONLINE")).toBe(false);
		expect(requiresLink("ONLINE")).toBe(true);
		expect(requiresVenue("HYBRID")).toBe(true);
		expect(requiresLink("HYBRID")).toBe(true);
	});
});

describe("assertSessionRange", () => {
	test("acepta una sesión que termina después de empezar", () => {
		expect(() =>
			assertSessionRange({ startTime: "09:00", endTime: "13:00" }, 1),
		).not.toThrow();
	});

	test.each([
		["13:00", "09:00"],
		["09:00", "09:00"],
	])("rechaza %s–%s señalando la sesión", (startTime, endTime) => {
		expect(() => assertSessionRange({ startTime, endTime }, 2)).toThrowError(
			expect.objectContaining({
				code: COURSE_ERROR_CODES.SESSION_INVALID_RANGE,
				details: { sessionNumber: 2 },
			}),
		);
	});
});

describe("assertSessionLimit", () => {
	test("el tope es del formulario, no del negocio", () => {
		expect(() => assertSessionLimit(COURSE_MAX_SESSIONS)).not.toThrow();
		expect(() => assertSessionLimit(COURSE_MAX_SESSIONS + 1)).toThrowError(
			codeOf(COURSE_ERROR_CODES.TOO_MANY_SESSIONS),
		);
	});

	test("cero sesiones es válido: el borrador se completa después", () => {
		expect(() => assertSessionLimit(0)).not.toThrow();
	});
});

describe("assertCapacityCovers", () => {
	test("acepta un cupo igual a los inscritos o sin cupo", () => {
		expect(() => assertCapacityCovers(2, 2)).not.toThrow();
		expect(() => assertCapacityCovers(null, 30)).not.toThrow();
	});

	test("rechaza un cupo menor que los inscritos", () => {
		expect(() => assertCapacityCovers(1, 2)).toThrow(
			expect.objectContaining({ code: "COURSE_CAPACITY_BELOW_ENROLLED" }),
		);
	});
});

describe("assertDeadlineBeforeStart", () => {
	const firstSession = new Date("2026-10-05T16:00:00.000Z");

	test("acepta una fecha límite anterior al inicio", () => {
		expect(() =>
			assertDeadlineBeforeStart(
				new Date("2026-10-01T06:59:00.000Z"),
				firstSession,
			),
		).not.toThrow();
	});

	test("rechaza una posterior, que no significaría nada", () => {
		expect(() =>
			assertDeadlineBeforeStart(
				new Date("2026-10-10T06:59:00.000Z"),
				firstSession,
			),
		).toThrowError(codeOf(COURSE_ERROR_CODES.DEADLINE_AFTER_START));
	});

	test("sin fecha límite o sin sesiones no hay nada que comparar", () => {
		expect(() => assertDeadlineBeforeStart(null, firstSession)).not.toThrow();
		expect(() => assertDeadlineBeforeStart(new Date(), null)).not.toThrow();
	});
});

describe("assertPublishable", () => {
	test("un borrador completo se publica", () => {
		expect(() => assertPublishable(courseOf())).not.toThrow();
	});

	test("un curso ya publicado no se vuelve a publicar", () => {
		expect(() =>
			assertPublishable(courseOf({ status: "PUBLISHED" })),
		).toThrowError(
			expect.objectContaining({
				code: COURSE_ERROR_CODES.INVALID_TRANSITION,
				details: { from: "PUBLISHED", to: "PUBLISHED" },
			}),
		);
	});

	test("sin sesiones no hay nada que impartir", () => {
		expect(() => assertPublishable(courseOf({ sessions: [] }))).toThrowError(
			codeOf(COURSE_ERROR_CODES.WITHOUT_SESSIONS),
		);
	});

	// Se comprueba al publicar y no al asignar: desactivar un perfil no puede
	// deshacer una asignación ya hecha.
	test("un capacitador con el perfil desactivado no sostiene el curso", () => {
		expect(() =>
			assertPublishable(courseOf({ trainers: [{ isActive: false }] })),
		).toThrowError(codeOf(COURSE_ERROR_CODES.WITHOUT_ACTIVE_TRAINER));
	});

	test("basta uno activo aunque haya otros desactivados", () => {
		expect(() =>
			assertPublishable(
				courseOf({ trainers: [{ isActive: false }, { isActive: true }] }),
			),
		).not.toThrow();
	});

	// El número de sesión es lo único accionable del mensaje: sin él, el usuario
	// tiene que revisar las sesiones una por una.
	test("señala QUÉ sesión se quedó sin sede", () => {
		expect(() =>
			assertPublishable(
				courseOf({
					sessions: [sessionOf(), sessionOf({ venue: null }), sessionOf()],
				}),
			),
		).toThrowError(
			expect.objectContaining({
				code: COURSE_ERROR_CODES.SESSION_MISSING_VENUE,
				details: { sessionNumber: 2 },
			}),
		);
	});

	test("un curso en línea exige enlace, no sede", () => {
		expect(() =>
			assertPublishable(
				courseOf({
					modality: "ONLINE",
					sessions: [sessionOf({ venue: null })],
				}),
			),
		).toThrowError(codeOf(COURSE_ERROR_CODES.SESSION_MISSING_LINK));

		expect(() =>
			assertPublishable(
				courseOf({
					modality: "ONLINE",
					sessions: [
						sessionOf({ venue: null, link: "https://meet.example/x" }),
					],
				}),
			),
		).not.toThrow();
	});

	test("uno híbrido exige las dos", () => {
		expect(() =>
			assertPublishable(courseOf({ modality: "HYBRID" })),
		).toThrowError(codeOf(COURSE_ERROR_CODES.SESSION_MISSING_LINK));
	});

	test("un curso restringido sin audiencia no se publica", () => {
		expect(() =>
			assertPublishable(courseOf({ access: "RESTRICTED" })),
		).toThrowError(codeOf(COURSE_ERROR_CODES.AUDIENCE_REQUIRED));
	});

	test("un grupo basta como audiencia: acota a unas pocas personas", () => {
		expect(() =>
			assertPublishable(
				courseOf({
					access: "RESTRICTED",
					audience: { dependencies: [], groups: [{}] },
				}),
			),
		).not.toThrow();
	});

	test("un curso por invitación no necesita audiencia declarada", () => {
		expect(() =>
			assertPublishable(courseOf({ access: "INVITATION" })),
		).not.toThrow();
	});
});

describe("publishChecklist", () => {
	const pending = (course: PublishableCourse) =>
		publishChecklist(course)
			.filter((entry) => !entry.done)
			.map((entry) => entry.check);

	test("un borrador completo no deja pendientes", () => {
		expect(pending(courseOf())).toEqual([]);
	});

	test("sin sesiones falta tanto el programa como su sede", () => {
		expect(pending(courseOf({ sessions: [] }))).toEqual(["sessions", "places"]);
	});

	test("una sesión híbrida sin enlace deja la sede pendiente", () => {
		expect(
			pending(
				courseOf({
					modality: "HYBRID",
					sessions: [sessionOf(), sessionOf({ link: "https://x.test" })],
				}),
			),
		).toEqual(["places"]);
	});

	test("un capacitador archivado no cuenta", () => {
		expect(pending(courseOf({ trainers: [{ isActive: false }] }))).toEqual([
			"trainer",
		]);
	});

	test("la audiencia solo se exige al acceso restringido", () => {
		expect(
			publishChecklist(courseOf()).map((entry) => entry.check),
		).not.toContain("audience");
		expect(pending(courseOf({ access: "RESTRICTED" }))).toEqual(["audience"]);
	});

	// La lista y la aserción describen la misma regla: si divergen, la ficha
	// promete una publicación que el servicio rechaza.
	test.each<[string, Partial<PublishableCourse>]>([
		["completo", {}],
		["sin sesiones", { sessions: [] }],
		["sin sede", { sessions: [sessionOf({ venue: null })] }],
		["sin capacitador activo", { trainers: [{ isActive: false }] }],
		["restringido sin audiencia", { access: "RESTRICTED" }],
		[
			"en línea sin enlace",
			{ modality: "ONLINE", sessions: [sessionOf({ link: null })] },
		],
	])("coincide con assertPublishable: %s", (_, overrides) => {
		const course = courseOf(overrides);
		const publishable = (() => {
			try {
				assertPublishable(course);
				return true;
			} catch {
				return false;
			}
		})();

		expect(pending(course).length === 0).toBe(publishable);
	});
});
