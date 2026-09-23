import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { toFieldErrors } from "@/shared/rules/format-vali-error";
import { COURSE_MAX_SESSIONS } from "../course.config";
import { COURSE_ERROR_CODES } from "../course.errors";
import {
	assertCapacityCovers,
	assertCompletionRuleCoherent,
	assertCompletionSettingsEditable,
	assertDeadlineBeforeStart,
	assertFormatEditable,
	assertPublishable,
	assertSessionLimit,
	assertSessionRange,
	COURSE_COMPLETION_RULES,
	type CourseCompletionRule,
	type CourseContentFacts,
	type CourseFormat,
	type CourseStatus,
	canCancel,
	canEdit,
	canPublish,
	countsAttendance,
	countsContent,
	courseHoursOf,
	createCourseRule,
	type EvaluationMethod,
	evaluatesByQuiz,
	publishChecklist,
	requiresContent,
	requiresLink,
	requiresSessions,
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
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
	requiresEvaluation: false,
	evaluationMethod: "MANUAL",
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

describe("courseHoursOf", () => {
	const sessions = [
		{
			startsAt: new Date("2026-10-01T16:00:00.000Z"),
			endsAt: new Date("2026-10-01T19:00:00.000Z"),
		},
		{
			startsAt: new Date("2026-10-02T16:00:00.000Z"),
			endsAt: new Date("2026-10-02T17:30:00.000Z"),
		},
	];

	test("las horas capturadas mandan aunque haya sesiones", () => {
		expect(courseHoursOf({ hours: 20, sessions })).toBe(20);
	});

	test("sin horas capturadas, suma la duración de las sesiones", () => {
		expect(courseHoursOf({ hours: null, sessions })).toBe(4.5);
	});

	test("sin horas ni sesiones no inventa una duración", () => {
		expect(courseHoursOf({ hours: null, sessions: [] })).toBeNull();
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

/** Con temario: el caso sin lecciones se pide explícito, nunca por descuido. */
const CONTENT: CourseContentFacts = {
	lessonCount: 2,
	finalQuizQuestionCount: 0,
};
const NO_CONTENT: CourseContentFacts = {
	lessonCount: 0,
	finalQuizQuestionCount: 0,
};

describe("assertPublishable", () => {
	test("un borrador completo se publica", () => {
		expect(() => assertPublishable(courseOf(), CONTENT)).not.toThrow();
	});

	test("un curso ya publicado no se vuelve a publicar", () => {
		expect(() =>
			assertPublishable(courseOf({ status: "PUBLISHED" }), CONTENT),
		).toThrowError(
			expect.objectContaining({
				code: COURSE_ERROR_CODES.INVALID_TRANSITION,
				details: { from: "PUBLISHED", to: "PUBLISHED" },
			}),
		);
	});

	test("sin sesiones no hay nada que impartir", () => {
		expect(() =>
			assertPublishable(courseOf({ sessions: [] }), CONTENT),
		).toThrowError(codeOf(COURSE_ERROR_CODES.WITHOUT_SESSIONS));
	});

	test("un autogestivo se publica sin una sola sesión", () => {
		expect(() =>
			assertPublishable(
				courseOf({ format: "SELF_PACED", sessions: [] }),
				CONTENT,
			),
		).not.toThrow();
	});

	test("un autogestivo sin lecciones no tiene qué dar a recorrer", () => {
		expect(() =>
			assertPublishable(
				courseOf({ format: "SELF_PACED", sessions: [] }),
				NO_CONTENT,
			),
		).toThrowError(codeOf(COURSE_ERROR_CODES.WITHOUT_LESSONS));
	});

	test("un calendarizado sin lecciones se publica igual que siempre", () => {
		expect(() => assertPublishable(courseOf(), NO_CONTENT)).not.toThrow();
	});

	// docs/adr/0015: evaluar por examen sin examen dejaría a todo inscrito
	// en pendiente.
	test("un curso evaluado por examen pide un examen con preguntas", () => {
		const byQuiz = courseOf({
			requiresEvaluation: true,
			evaluationMethod: "QUIZ",
		});

		expect(() => assertPublishable(byQuiz, CONTENT)).toThrowError(
			codeOf(COURSE_ERROR_CODES.WITHOUT_QUIZ),
		);
		expect(publishChecklist(byQuiz, CONTENT)).toContainEqual({
			check: "quiz",
			done: false,
		});
		expect(() =>
			assertPublishable(byQuiz, { ...CONTENT, finalQuizQuestionCount: 3 }),
		).not.toThrow();
	});

	test("con captura manual no se enseña el pendiente del examen", () => {
		const manual = courseOf({ requiresEvaluation: true });

		expect(
			publishChecklist(manual, CONTENT).map((entry) => entry.check),
		).not.toContain("quiz");
		expect(evaluatesByQuiz(manual)).toBe(false);
		expect(
			evaluatesByQuiz({ requiresEvaluation: false, evaluationMethod: "QUIZ" }),
		).toBe(false);
	});

	test("un calendarizado que también se completa por contenido pide lecciones", () => {
		expect(() =>
			assertPublishable(courseOf({ completionRule: "BOTH" }), NO_CONTENT),
		).toThrowError(codeOf(COURSE_ERROR_CODES.WITHOUT_LESSONS));
		expect(
			publishChecklist(courseOf({ completionRule: "BOTH" }), NO_CONTENT),
		).toContainEqual({ check: "content", done: false });
	});

	// Se comprueba al publicar y no al asignar: desactivar un perfil no puede
	// deshacer una asignación ya hecha.
	test("un capacitador con el perfil desactivado no sostiene el curso", () => {
		expect(() =>
			assertPublishable(courseOf({ trainers: [{ isActive: false }] }), CONTENT),
		).toThrowError(codeOf(COURSE_ERROR_CODES.WITHOUT_ACTIVE_TRAINER));
	});

	test("basta uno activo aunque haya otros desactivados", () => {
		expect(() =>
			assertPublishable(
				courseOf({ trainers: [{ isActive: false }, { isActive: true }] }),
				CONTENT,
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
				CONTENT,
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
				CONTENT,
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
				CONTENT,
			),
		).not.toThrow();
	});

	test("uno híbrido exige las dos", () => {
		expect(() =>
			assertPublishable(courseOf({ modality: "HYBRID" }), CONTENT),
		).toThrowError(codeOf(COURSE_ERROR_CODES.SESSION_MISSING_LINK));
	});

	test("un curso restringido sin audiencia no se publica", () => {
		expect(() =>
			assertPublishable(courseOf({ access: "RESTRICTED" }), CONTENT),
		).toThrowError(codeOf(COURSE_ERROR_CODES.AUDIENCE_REQUIRED));
	});

	test("un grupo basta como audiencia: acota a unas pocas personas", () => {
		expect(() =>
			assertPublishable(
				courseOf({
					access: "RESTRICTED",
					audience: { dependencies: [], groups: [{}] },
				}),
				CONTENT,
			),
		).not.toThrow();
	});

	test("un curso por invitación no necesita audiencia declarada", () => {
		expect(() =>
			assertPublishable(courseOf({ access: "INVITATION" }), CONTENT),
		).not.toThrow();
	});
});

describe("publishChecklist", () => {
	const pending = (
		course: PublishableCourse,
		content: CourseContentFacts = CONTENT,
	) =>
		publishChecklist(course, content)
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

	test("un autogestivo no enseña pendientes de sesión, sí el de contenido", () => {
		const checks = publishChecklist(
			courseOf({ format: "SELF_PACED", sessions: [] }),
			CONTENT,
		).map((entry) => entry.check);

		expect(checks).not.toContain("sessions");
		expect(checks).not.toContain("places");
		expect(checks).toContain("trainer");
		expect(checks).toContain("content");
	});

	test("un autogestivo sin lecciones deja el contenido pendiente", () => {
		expect(
			pending(courseOf({ format: "SELF_PACED", sessions: [] }), NO_CONTENT),
		).toEqual(["content"]);
	});

	test("un calendarizado no enseña el pendiente de contenido", () => {
		expect(
			publishChecklist(courseOf(), NO_CONTENT).map((entry) => entry.check),
		).not.toContain("content");
	});

	test("la audiencia solo se exige al acceso restringido", () => {
		expect(
			publishChecklist(courseOf(), CONTENT).map((entry) => entry.check),
		).not.toContain("audience");
		expect(pending(courseOf({ access: "RESTRICTED" }))).toEqual(["audience"]);
	});

	// La lista y la aserción describen la misma regla: si divergen, la ficha
	// promete una publicación que el servicio rechaza.
	test.each<[string, Partial<PublishableCourse>, CourseContentFacts]>([
		["completo", {}, CONTENT],
		["completo sin lecciones", {}, NO_CONTENT],
		["sin sesiones", { sessions: [] }, CONTENT],
		["sin sede", { sessions: [sessionOf({ venue: null })] }, CONTENT],
		["sin capacitador activo", { trainers: [{ isActive: false }] }, CONTENT],
		["restringido sin audiencia", { access: "RESTRICTED" }, CONTENT],
		[
			"en línea sin enlace",
			{ modality: "ONLINE", sessions: [sessionOf({ link: null })] },
			CONTENT,
		],
		[
			"autogestivo sin sesiones",
			{ format: "SELF_PACED", sessions: [] },
			CONTENT,
		],
		[
			"autogestivo sin lecciones",
			{ format: "SELF_PACED", sessions: [] },
			NO_CONTENT,
		],
		[
			"asistencia y contenido sin lecciones",
			{ completionRule: "BOTH" },
			NO_CONTENT,
		],
		[
			"autogestivo sin capacitador",
			{
				format: "SELF_PACED",
				sessions: [],
				trainers: [{ isActive: false }],
			} as Partial<PublishableCourse>,
			CONTENT,
		],
	])("coincide con assertPublishable: %s", (_, overrides, content) => {
		const course = courseOf(overrides);
		const publishable = (() => {
			try {
				assertPublishable(course, content);
				return true;
			} catch {
				return false;
			}
		})();

		expect(pending(course, content).length === 0).toBe(publishable);
	});
});

describe("formato y regla de completado", () => {
	test("solo el calendarizado pide sesiones", () => {
		expect(requiresSessions("SCHEDULED")).toBe(true);
		expect(requiresSessions("SELF_PACED")).toBe(false);
	});

	test.each<CourseCompletionRule>(["ATTENDANCE", "BOTH"])(
		"un autogestivo no se puede completar con una regla que cuenta asistencia: %s",
		(completionRule) => {
			expect(() =>
				assertCompletionRuleCoherent({ format: "SELF_PACED", completionRule }),
			).toThrowError(codeOf(COURSE_ERROR_CODES.INCOMPATIBLE_COMPLETION_RULE));
		},
	);

	// El avance por lección le da a `CONTENT` algo que medir: la evaluación deja
	// de ser obligatoria (docs/adr/0014).
	test.each<[CourseFormat, CourseCompletionRule]>([
		["SELF_PACED", "CONTENT"],
		["SCHEDULED", "ATTENDANCE"],
		["SCHEDULED", "CONTENT"],
		["SCHEDULED", "BOTH"],
	])("%s con %s es válido", (format, completionRule) => {
		expect(() =>
			assertCompletionRuleCoherent({ format, completionRule }),
		).not.toThrow();
	});

	test("qué cuenta cada regla", () => {
		expect(COURSE_COMPLETION_RULES.filter(countsAttendance)).toEqual([
			"ATTENDANCE",
			"BOTH",
		]);
		expect(COURSE_COMPLETION_RULES.filter(countsContent)).toEqual([
			"CONTENT",
			"BOTH",
		]);
	});

	test("piden temario el autogestivo y el que se completa también por contenido", () => {
		expect(
			requiresContent({ format: "SELF_PACED", completionRule: "CONTENT" }),
		).toBe(true);
		expect(
			requiresContent({ format: "SCHEDULED", completionRule: "BOTH" }),
		).toBe(true);
		expect(
			requiresContent({ format: "SCHEDULED", completionRule: "CONTENT" }),
		).toBe(false);
		expect(
			requiresContent({ format: "SCHEDULED", completionRule: "ATTENDANCE" }),
		).toBe(false);
	});

	describe("assertCompletionSettingsEditable", () => {
		const selfPaced = {
			status: "PUBLISHED" as CourseStatus,
			format: "SELF_PACED" as CourseFormat,
			completionRule: "CONTENT" as CourseCompletionRule,
			requiresEvaluation: false,
			evaluationMethod: "MANUAL" as EvaluationMethod,
		};
		const unchanged = {
			completionRule: "CONTENT" as CourseCompletionRule,
			requiresEvaluation: false,
			evaluationMethod: "MANUAL" as EvaluationMethod,
		};

		test("un autogestivo publicado no cambia su evaluación", () => {
			expect(() =>
				assertCompletionSettingsEditable(selfPaced, {
					...unchanged,
					requiresEvaluation: true,
				}),
			).toThrowError(codeOf(COURSE_ERROR_CODES.COMPLETION_LOCKED));
		});

		test("guardarlo sin tocar la regla pasa", () => {
			expect(() =>
				assertCompletionSettingsEditable(selfPaced, unchanged),
			).not.toThrow();
		});

		test("en borrador se cambia libremente", () => {
			expect(() =>
				assertCompletionSettingsEditable(
					{ ...selfPaced, status: "DRAFT" },
					{ ...unchanged, requiresEvaluation: true, evaluationMethod: "QUIZ" },
				),
			).not.toThrow();
		});

		// Un calendarizado calcula todo al cierre: cambiarla antes no deja
		// créditos medidos con otro criterio.
		test("un calendarizado publicado sí cambia su regla", () => {
			expect(() =>
				assertCompletionSettingsEditable(
					{ ...selfPaced, format: "SCHEDULED", completionRule: "ATTENDANCE" },
					{ ...unchanged, completionRule: "BOTH", requiresEvaluation: true },
				),
			).not.toThrow();
		});

		// docs/adr/0015: pasar de captura a examen a mitad dejaría resultados
		// medidos de dos formas, en cualquier formato.
		test("el método de evaluación se congela al publicar, también con sesiones", () => {
			expect(() =>
				assertCompletionSettingsEditable(
					{ ...selfPaced, format: "SCHEDULED", completionRule: "ATTENDANCE" },
					{
						completionRule: "ATTENDANCE",
						requiresEvaluation: false,
						evaluationMethod: "QUIZ",
					},
				),
			).toThrowError(codeOf(COURSE_ERROR_CODES.COMPLETION_LOCKED));
		});
	});

	test("el formato solo cambia en borrador", () => {
		expect(() => assertFormatEditable("DRAFT", true)).not.toThrow();
		expect(() => assertFormatEditable("PUBLISHED", false)).not.toThrow();
		expect(() => assertFormatEditable("PUBLISHED", true)).toThrowError(
			codeOf(COURSE_ERROR_CODES.FORMAT_LOCKED),
		);
	});
});

// El formulario de alta enseñaba "Invalid length: Expected >=3 but received 0"
// bajo el campo. Los mensajes del dominio son texto de UI y se comprueban aquí,
// no en los errores tipados —donde lo estable es el `code`.
describe("mensajes de la regla de alta", () => {
	const fieldErrorsOf = (input: unknown) =>
		toFieldErrors(v.safeParse(createCourseRule, input).issues ?? []);

	const draft = {
		title: "Ofimática básica",
		modality: "IN_PERSON",
		access: "PUBLIC",
		trainers: [],
		sessions: [],
	};

	test("el título corto nombra el campo y habla en español", () => {
		expect(fieldErrorsOf({ ...draft, title: "Of" }).title).toBe(
			"El título debe tener al menos 3 caracteres.",
		);
	});

	// Una clave que no llega la reporta el esquema del OBJETO, no el del campo:
	// ahi no hay etiqueta que nombrar y responde el respaldo compartido. El
	// mensaje se pinta bajo el control, asi que se lee con su propia etiqueta.
	test("un campo ausente se pide, no se describe su tipo", () => {
		const { title: _omitted, ...withoutTitle } = draft;

		expect(fieldErrorsOf(withoutTitle).title).toBe("Este dato es obligatorio.");
	});

	test("un formato inventado se rechaza en español", () => {
		expect(fieldErrorsOf({ ...draft, format: "MAGIC" }).format).toBe(
			"Elige un formato válido.",
		);
	});

	test("una regla de completado inventada se rechaza en español", () => {
		expect(
			fieldErrorsOf({ ...draft, completionRule: "VIBES" }).completionRule,
		).toBe("Elige una regla de completado válida.");
	});

	test("el cupo fuera de rango explica el límite", () => {
		expect(fieldErrorsOf({ ...draft, capacity: 0 }).capacity).toBe(
			"El cupo debe ser de al menos 1 persona.",
		);
	});

	test("una sesión con fecha mal escrita explica el formato", () => {
		const errors = fieldErrorsOf({
			...draft,
			sessions: [{ date: "12/06/2026", startTime: "09:00", endTime: "11:00" }],
		});

		expect(errors["sessions.0.date"]).toBe(
			"Escribe la fecha con el formato AAAA-MM-DD.",
		);
	});
});
