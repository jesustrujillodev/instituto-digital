import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { toFieldErrors } from "@/shared/rules/format-vali-error";
import { CONTENT_ERROR_CODES } from "../content.errors";
import {
	assertBankEditable,
	assertCanSubmit,
	assertRetakeGrantable,
	attemptsLeftOf,
	canGrantRetakeOn,
	courseGradeOf,
	courseResultOf,
	courseScoresOf,
	FINAL_QUIZ_OWNER,
	followUpAvailabilityOf,
	followUpOwnerOf,
	followUpStateOf,
	followUpWindowOf,
	gradeAttempt,
	isAccredited,
	nextAttemptNumberOf,
	pointsToPass,
	quizAvailabilityOf,
	quizKindOf,
	saveFollowUpQuestionsRule,
	saveFollowUpRule,
	saveQuizRule,
	toFollowUpSettingsWrite,
	toQuizBankWrite,
	toQuizOutcome,
	toQuizSheet,
	toTrueFalseOptions,
} from "../quiz.rules";
import type { StoredAttempt, StoredQuiz } from "../quiz.types";

const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const Q3 = "33333333-3333-4333-8333-333333333333";

const optionOf = (id: number, isCorrect: boolean) => ({
	id,
	documentId: `0000000${id}-0000-4000-8000-000000000000`,
	text: `Opción ${id}`,
	isCorrect,
});

/** Tres preguntas de 1, 2 y 3 puntos: seis en total, mínimo 70. */
const quizOf = (overrides: Partial<StoredQuiz> = {}): StoredQuiz => ({
	id: 1,
	documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	title: "Examen final",
	passingScore: 70,
	maxAttempts: 1,
	shuffleQuestions: false,
	questions: [
		{
			id: 10,
			documentId: Q1,
			statement: "¿Uno?",
			type: "SINGLE_CHOICE",
			points: 1,
			options: [optionOf(1, true), optionOf(2, false)],
		},
		{
			id: 20,
			documentId: Q2,
			statement: "¿Dos?",
			type: "TRUE_FALSE",
			points: 2,
			options: [optionOf(3, false), optionOf(4, true)],
		},
		{
			id: 30,
			documentId: Q3,
			statement: "¿Tres?",
			type: "SINGLE_CHOICE",
			points: 3,
			options: [optionOf(5, true), optionOf(6, false), optionOf(7, false)],
		},
	],
	...overrides,
});

const answer = (questionDocumentId: string, optionId: number) => ({
	questionDocumentId,
	optionDocumentId: `0000000${optionId}-0000-4000-8000-000000000000`,
});

const codeOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return null;
};

describe("pointsToPass", () => {
	test.each([
		[5, 70, 4],
		[10, 70, 7],
		[3, 70, 3],
		[5, 0, 0],
		[5, 100, 5],
	])(
		"con %i puntos y mínima de %i se aprueba con %i",
		(total, passing, points) => {
			expect(pointsToPass(total, passing)).toBe(points);
		},
	);

	// La misma cuenta que califica: con esos puntos la nota alcanza la mínima, y
	// con uno menos no.
	test("coincide con la nota que se calcula al presentarlo", () => {
		for (const total of [1, 3, 5, 7, 12]) {
			for (const passing of [0, 33, 50, 67, 70, 99, 100]) {
				const needed = pointsToPass(total, passing);
				expect(Math.floor((needed * 100) / total)).toBeGreaterThanOrEqual(
					passing,
				);
				if (needed > 0) {
					expect(Math.floor(((needed - 1) * 100) / total)).toBeLessThan(
						passing,
					);
				}
			}
		}
	});
});

describe("gradeAttempt", () => {
	test("todas correctas da 100 y aprueba", () => {
		const graded = gradeAttempt(quizOf(), [
			answer(Q1, 1),
			answer(Q2, 4),
			answer(Q3, 5),
		]);

		expect(graded).toMatchObject({ score: 100, passed: true });
		expect(graded.answers).toEqual([
			{ questionId: 10, optionId: 1, isCorrect: true },
			{ questionId: 20, optionId: 4, isCorrect: true },
			{ questionId: 30, optionId: 5, isCorrect: true },
		]);
	});

	test("ninguna correcta da 0", () => {
		expect(
			gradeAttempt(quizOf(), [answer(Q1, 2), answer(Q2, 3), answer(Q3, 6)]),
		).toMatchObject({ score: 0, passed: false });
	});

	// 1 + 3 de 6 puntos = 66,6…: se redondea hacia abajo, como la asistencia.
	test("los puntos pesan distinto y se redondea hacia abajo", () => {
		expect(
			gradeAttempt(quizOf(), [answer(Q1, 1), answer(Q2, 3), answer(Q3, 5)]),
		).toMatchObject({ score: 66, passed: false });
	});

	test("quien llega justo a la mínima aprueba", () => {
		const quiz = quizOf({ passingScore: 50 });

		expect(
			gradeAttempt(quiz, [answer(Q1, 2), answer(Q2, 3), answer(Q3, 5)]),
		).toMatchObject({ score: 50, passed: true });
	});

	test.each([
		["falta una pregunta", [answer(Q1, 1), answer(Q2, 4)]],
		[
			"una pregunta respondida dos veces",
			[answer(Q1, 1), answer(Q1, 2), answer(Q2, 4)],
		],
		[
			"una opción que es de otra pregunta",
			[answer(Q1, 5), answer(Q2, 4), answer(Q3, 5)],
		],
	])("%s se rechaza", (_, answers) => {
		expect(codeOf(() => gradeAttempt(quizOf(), answers))).toBe(
			CONTENT_ERROR_CODES.QUIZ_INCOMPLETE,
		);
	});
});

describe("lo que ve quien lo presenta", () => {
	test("la hoja no lleva la respuesta correcta", () => {
		const sheet = toQuizSheet(quizOf(), "semilla", 2);

		expect(JSON.stringify(sheet)).not.toContain("isCorrect");
		expect(sheet.totalPoints).toBe(6);
		expect(sheet.attemptsLeft).toBe(2);
	});

	test("barajar con la misma semilla da el mismo orden", () => {
		const quiz = quizOf({ shuffleQuestions: true });
		const order = (seed: string) =>
			toQuizSheet(quiz, seed, null).questions.map(
				(question) => question.documentId,
			);

		expect(order("quiz:50")).toEqual(order("quiz:50"));
		expect([...order("quiz:50")].sort()).toEqual([Q1, Q2, Q3].sort());
	});

	test("el resultado dice qué acertó, no cuál era la correcta", () => {
		const outcome = toQuizOutcome(quizOf(), {
			submittedAt: new Date("2027-03-10T18:00:00Z"),
			score: 66,
			passed: false,
			answers: [
				{ questionId: 10, optionId: 1, isCorrect: true },
				{ questionId: 20, optionId: 3, isCorrect: false },
				{ questionId: 30, optionId: 5, isCorrect: true },
			],
		});

		expect(outcome.questions.map((question) => question.correct)).toEqual([
			true,
			false,
			true,
		]);
		expect(JSON.stringify(outcome)).not.toMatch(/isCorrect|optionId|options/);
	});
});

const attemptOf = (overrides: Partial<StoredAttempt> = {}): StoredAttempt => ({
	id: 1,
	number: 1,
	submittedAt: new Date(),
	score: 80,
	passed: true,
	retakeGrantedAt: null,
	answers: [],
	...overrides,
});

const enrollmentOf = (
	overrides: Partial<{
		contentCompletedAt: Date | null;
		result: "PENDING" | "PASSED" | "FAILED";
		completed: boolean;
	}> = {},
) => ({
	contentCompletedAt: null,
	result: "PENDING" as const,
	completed: false,
	...overrides,
});

describe("disponibilidad", () => {
	const content = { completionRule: "CONTENT" as const };
	const attendance = { completionRule: "ATTENDANCE" as const };
	const finished = enrollmentOf({ contentCompletedAt: new Date() });
	const taken = attemptOf();
	const failed = attemptOf({ passed: false, score: 40 });

	test("el examen de un curso por contenido espera a terminar las obligatorias", () => {
		expect(quizAvailabilityOf(content, enrollmentOf(), null, "FINAL", 1)).toBe(
			"LOCKED_BY_CONTENT",
		);
		expect(quizAvailabilityOf(content, finished, null, "FINAL", 1)).toBe(
			"AVAILABLE",
		);
	});

	test("sin contenido que contar, está disponible desde la inscripción", () => {
		expect(
			quizAvailabilityOf(attendance, enrollmentOf(), null, "FINAL", 1),
		).toBe("AVAILABLE");
	});

	test("la práctica y el módulo nunca esperan al contenido", () => {
		expect(
			quizAvailabilityOf(content, enrollmentOf(), null, "PRACTICE", null),
		).toBe("AVAILABLE");
		expect(quizAvailabilityOf(content, enrollmentOf(), null, "MODULE", 1)).toBe(
			"AVAILABLE",
		);
	});

	test("aprobado se cierra aunque queden intentos, y un segundo envío se rechaza", () => {
		expect(quizAvailabilityOf(content, finished, taken, "FINAL", 3)).toBe(
			"TAKEN",
		);
		expect(codeOf(() => assertCanSubmit("TAKEN"))).toBe(
			CONTENT_ERROR_CODES.QUIZ_ALREADY_TAKEN,
		);
		expect(codeOf(() => assertCanSubmit("LOCKED_BY_CONTENT"))).toBe(
			CONTENT_ERROR_CODES.QUIZ_NOT_AVAILABLE,
		);
	});

	// docs/adr/0024: reprobado se reintenta mientras queden intentos.
	test.each([
		["FINAL" as const, finished],
		["MODULE" as const, enrollmentOf()],
		["PRACTICE" as const, enrollmentOf()],
	])("%s reprobado se reabre si le quedan intentos", (kind, enrollment) => {
		expect(quizAvailabilityOf(content, enrollment, failed, kind, 2)).toBe(
			"AVAILABLE",
		);
		expect(quizAvailabilityOf(content, enrollment, failed, kind, 1)).toBe(
			"TAKEN",
		);
		expect(nextAttemptNumberOf(failed)).toBe(2);
	});

	test("sin límite, reprobado siempre se reabre", () => {
		const fifth = attemptOf({ passed: false, number: 5 });
		expect(
			quizAvailabilityOf(content, enrollmentOf(), fifth, "PRACTICE", null),
		).toBe("AVAILABLE");
	});

	test("agotados, otro intento habilitado lo reabre una vez", () => {
		const reopened = attemptOf({ passed: false, retakeGrantedAt: new Date() });
		expect(
			quizAvailabilityOf(content, enrollmentOf(), reopened, "MODULE", 1),
		).toBe("AVAILABLE");

		const afterRetake = attemptOf({ passed: false, number: 2 });
		expect(
			quizAvailabilityOf(content, enrollmentOf(), afterRetake, "MODULE", 1),
		).toBe("TAKEN");
	});

	test("ya acreditado, lo reprobado no se reintenta", () => {
		expect(
			quizAvailabilityOf(
				content,
				enrollmentOf({ result: "PASSED" }),
				failed,
				"MODULE",
				3,
			),
		).toBe("TAKEN");
		expect(
			quizAvailabilityOf(
				content,
				enrollmentOf({ completed: true }),
				failed,
				"PRACTICE",
				null,
			),
		).toBe("TAKEN");
		expect(isAccredited(enrollmentOf())).toBe(false);
	});
});

describe("intentos restantes", () => {
	test("cuenta los usados contra el tope", () => {
		expect(attemptsLeftOf(3, null)).toBe(3);
		expect(attemptsLeftOf(3, attemptOf({ number: 1 }))).toBe(2);
		expect(attemptsLeftOf(3, attemptOf({ number: 3 }))).toBe(0);
	});

	test("sin límite no hay cuenta", () => {
		expect(attemptsLeftOf(null, attemptOf({ number: 8 }))).toBeNull();
	});

	test("el habilitado suma uno", () => {
		expect(
			attemptsLeftOf(1, attemptOf({ number: 1, retakeGrantedAt: new Date() })),
		).toBe(1);
	});
});

describe("calificación del curso", () => {
	test("es el promedio, en enteros y hacia abajo", () => {
		expect(courseGradeOf([80, 90, 70])).toBe(80);
		expect(courseGradeOf([95, 70])).toBe(82);
		expect(courseGradeOf([100])).toBe(100);
	});

	test("sin evaluaciones no hay calificación", () => {
		expect(courseGradeOf([])).toBeNull();
	});

	// docs/adr/0024: una reprobada se compensa con las demás.
	test("se acredita con el promedio contra la mínima del curso", () => {
		expect(courseGradeOf([50, 100, 100])).toBe(83);
		expect(courseResultOf(83, 70)).toBe("PASSED");
		expect(courseResultOf(70, 70)).toBe("PASSED");
		expect(courseResultOf(69, 70)).toBe("FAILED");
	});
});

describe("otro intento", () => {
	test("sobre el último reprobado, con los intentos agotados", () => {
		const failed = attemptOf({ passed: false, score: 40 });
		expect(assertRetakeGrantable(failed, 1)).toBe(failed);
		expect(canGrantRetakeOn(failed, 1)).toBe(true);
	});

	test.each([
		["sin intento", null, 1],
		["aprobado", attemptOf({ passed: true }), 1],
		[
			"con otro ya habilitado",
			attemptOf({ passed: false, retakeGrantedAt: new Date() }),
			1,
		],
		["con intentos restantes", attemptOf({ passed: false }), 2],
		["sin límite", attemptOf({ passed: false, number: 4 }), null],
	])("%s se rechaza", (_, attempt, maxAttempts) => {
		expect(codeOf(() => assertRetakeGrantable(attempt, maxAttempts))).toBe(
			CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED,
		);
	});
});

describe("el dueño del cuestionario", () => {
	const MODULE = "44444444-4444-4444-8444-444444444444";

	test("de qué cuelga decide qué es", () => {
		expect(quizKindOf(FINAL_QUIZ_OWNER)).toBe("FINAL");
		expect(
			quizKindOf({
				lessonDocumentId: Q1,
				moduleDocumentId: null,
				followUpDocumentId: null,
			}),
		).toBe("PRACTICE");
		expect(
			quizKindOf({
				lessonDocumentId: null,
				moduleDocumentId: MODULE,
				followUpDocumentId: null,
			}),
		).toBe("MODULE");
		expect(quizKindOf(followUpOwnerOf(MODULE))).toBe("FOLLOW_UP");
	});

	test("sin módulo en el cuerpo, el módulo es nulo", () => {
		const parsed = v.parse(saveQuizRule, {
			lessonDocumentId: null,
			title: "Examen",
			passingScore: 70,
			maxAttempts: 1,
			shuffleQuestions: false,
			questions: [
				{
					statement: "¿Cuál?",
					type: "SINGLE_CHOICE",
					points: 1,
					options: [
						{ text: "A", isCorrect: true },
						{ text: "B", isCorrect: false },
					],
				},
			],
		});
		expect(parsed.moduleDocumentId).toBeNull();
	});

	test("de una lección y de un módulo a la vez se rechaza", () => {
		expect(
			v.safeParse(saveQuizRule, {
				lessonDocumentId: Q1,
				moduleDocumentId: MODULE,
				title: "Examen",
				passingScore: 70,
				maxAttempts: 1,
				shuffleQuestions: false,
				questions: [],
			}).success,
		).toBe(false);
	});
});

describe("el banco", () => {
	const questionOf = (overrides: Record<string, unknown> = {}) => ({
		statement: "¿Cuál?",
		type: "SINGLE_CHOICE",
		points: 1,
		options: [
			{ text: "A", isCorrect: true },
			{ text: "B", isCorrect: false },
		],
		...overrides,
	});
	const bankOf = (
		question: Record<string, unknown>,
		overrides: Record<string, unknown> = {},
	) => ({
		lessonDocumentId: null,
		title: "Examen",
		passingScore: 70,
		maxAttempts: 1,
		shuffleQuestions: false,
		questions: [question],
		...overrides,
	});

	test("una pregunta válida pasa", () => {
		expect(v.safeParse(saveQuizRule, bankOf(questionOf())).success).toBe(true);
	});

	test("los intentos van de 1 a 10, o sin límite", () => {
		const parse = (maxAttempts: unknown) =>
			v.safeParse(saveQuizRule, bankOf(questionOf(), { maxAttempts }));

		expect(parse(null).success).toBe(true);
		expect(parse(10).success).toBe(true);
		expect(parse(0).success).toBe(false);
		expect(parse(11).success).toBe(false);
		expect(parse(1.5).success).toBe(false);
		expect(parse(undefined).success).toBe(false);
	});

	test.each([
		[
			"sin correcta",
			{
				options: [
					{ text: "A", isCorrect: false },
					{ text: "B", isCorrect: false },
				],
			},
		],
		[
			"con dos correctas",
			{
				options: [
					{ text: "A", isCorrect: true },
					{ text: "B", isCorrect: true },
				],
			},
		],
		["con una sola opción", { options: [{ text: "A", isCorrect: true }] }],
		["con puntos fuera de rango", { points: 11 }],
	])("una pregunta %s se rechaza", (_, overrides) => {
		expect(
			v.safeParse(saveQuizRule, bankOf(questionOf(overrides))).success,
		).toBe(false);
	});

	test("verdadero o falso lleva siempre sus dos textos fijos", () => {
		expect(toTrueFalseOptions(1)).toEqual([
			{ text: "Verdadero", isCorrect: false },
			{ text: "Falso", isCorrect: true },
		]);

		const write = toQuizBankWrite(
			v.parse(
				saveQuizRule,
				bankOf(
					questionOf({
						type: "TRUE_FALSE",
						options: [
							{ text: "Sí", isCorrect: true },
							{ text: "No", isCorrect: false },
						],
					}),
				),
			),
		);

		expect(write.questions[0]?.options).toEqual(toTrueFalseOptions(0));
	});

	test("con un intento enviado el banco se congela", () => {
		expect(() => assertBankEditable(0)).not.toThrow();
		expect(codeOf(() => assertBankEditable(1))).toBe(
			CONTENT_ERROR_CODES.QUIZ_LOCKED,
		);
	});
});

// ── Evaluaciones de seguimiento (docs/adr/0027) ──────────────────────────────

describe("ventana de una evaluación de seguimiento", () => {
	const session = {
		startsAt: new Date("2027-03-10T16:00:00.000Z"),
		endsAt: new Date("2027-03-10T18:00:00.000Z"),
	};
	const settings = {
		opensBeforeMinutes: null,
		closesAfterMinutes: null,
		openedAt: null,
		closedAt: null,
	};

	test("al iniciar: abierta mientras dura la sesión", () => {
		expect(
			followUpWindowOf({ ...settings, availability: "SESSION_START" }, session),
		).toEqual({ opensAt: session.startsAt, closesAt: session.endsAt });
	});

	test("al terminar: abre al fin y cierra los minutos indicados después", () => {
		expect(
			followUpWindowOf(
				{ ...settings, availability: "SESSION_END", closesAfterMinutes: 30 },
				session,
			),
		).toEqual({
			opensAt: session.endsAt,
			closesAt: new Date("2027-03-10T18:30:00.000Z"),
		});
	});

	test("rango: minutos antes del inicio y después del fin", () => {
		expect(
			followUpWindowOf(
				{
					...settings,
					availability: "RANGE",
					opensBeforeMinutes: 15,
					closesAfterMinutes: 10,
				},
				session,
			),
		).toEqual({
			opensAt: new Date("2027-03-10T15:45:00.000Z"),
			closesAt: new Date("2027-03-10T18:10:00.000Z"),
		});
	});

	test("manual: la abren y cierran a mano", () => {
		const openedAt = new Date("2027-03-10T17:00:00.000Z");
		expect(
			followUpWindowOf(
				{ ...settings, availability: "MANUAL", openedAt },
				session,
			),
		).toEqual({ opensAt: openedAt, closesAt: null });
	});

	test.each([
		["antes de abrir", "2027-03-10T15:59:59.000Z", "SCHEDULED"],
		["al abrir", "2027-03-10T16:00:00.000Z", "OPEN"],
		["justo al cerrar", "2027-03-10T18:00:00.000Z", "CLOSED"],
	] as const)("%s está %s", (_label, now, state) => {
		expect(
			followUpStateOf(
				{ opensAt: session.startsAt, closesAt: session.endsAt },
				"PUBLISHED",
				new Date(now),
			),
		).toBe(state);
	});

	test("sin fecha de apertura sigue programada; un curso finalizado la cierra", () => {
		const now = new Date("2027-03-10T17:00:00.000Z");
		expect(
			followUpStateOf({ opensAt: null, closesAt: null }, "PUBLISHED", now),
		).toBe("SCHEDULED");
		expect(
			followUpStateOf(
				{ opensAt: session.startsAt, closesAt: null },
				"FINISHED",
				now,
			),
		).toBe("CLOSED");
	});
});

describe("disponibilidad de una evaluación de seguimiento", () => {
	const enrollment = { result: "PENDING" as const, completed: false };
	const failed = { number: 1, passed: false, retakeGrantedAt: null };

	test("abierta y con asistencia, se presenta", () => {
		expect(followUpAvailabilityOf("OPEN", true, enrollment, null, 1)).toBe(
			"AVAILABLE",
		);
	});

	test("sin asistencia en la sesión no se presenta", () => {
		expect(followUpAvailabilityOf("OPEN", false, enrollment, null, 1)).toBe(
			"NOT_ATTENDED",
		);
	});

	test("fuera de su ventana: todavía no, o ya cerró", () => {
		expect(followUpAvailabilityOf("SCHEDULED", true, enrollment, null, 1)).toBe(
			"NOT_YET",
		);
		expect(followUpAvailabilityOf("CLOSED", true, enrollment, null, 1)).toBe(
			"CLOSED",
		);
	});

	test("los intentos siguen las reglas de los demás cuestionarios", () => {
		expect(followUpAvailabilityOf("OPEN", true, enrollment, failed, 1)).toBe(
			"TAKEN",
		);
		expect(followUpAvailabilityOf("OPEN", true, enrollment, failed, 2)).toBe(
			"AVAILABLE",
		);
	});

	test("cada estado propio frena el envío con su error", () => {
		expect(() => assertCanSubmit("NOT_YET")).toThrowError(
			expect.objectContaining({ code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_OPEN }),
		);
		expect(() => assertCanSubmit("CLOSED")).toThrowError(
			expect.objectContaining({ code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_OPEN }),
		);
		expect(() => assertCanSubmit("NOT_ATTENDED")).toThrowError(
			expect.objectContaining({
				code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_ATTENDED,
			}),
		);
	});
});

describe("courseScoresOf", () => {
	test("junta el temario, el examen final y el seguimiento que cuenta", () => {
		expect(
			courseScoresOf({
				content: [90],
				finalBest: 70,
				followUps: [
					{ countsTowardGrade: true, closed: false, best: 80 },
					{ countsTowardGrade: false, closed: true, best: 10 },
				],
			}),
		).toEqual([90, 70, 80]);
	});

	test("un seguimiento que cuenta vale 0 solo cuando ya cerró sin intento", () => {
		expect(
			courseScoresOf({
				content: [],
				finalBest: null,
				followUps: [
					{ countsTowardGrade: true, closed: true, best: null },
					{ countsTowardGrade: true, closed: false, best: null },
				],
			}),
		).toEqual([0]);
	});
});

describe("contratos del seguimiento", () => {
	const questions = [
		{
			statement: "¿Cuál?",
			type: "SINGLE_CHOICE",
			points: 1,
			options: [
				{ text: "Esta", isCorrect: true },
				{ text: "Aquella", isCorrect: false },
			],
		},
	];
	const base = {
		title: "Práctica de campo",
		passingScore: 60,
		maxAttempts: 1,
		shuffleQuestions: false,
		sessionDocumentId: "33333333-3333-4333-8333-333333333333",
		countsTowardGrade: true,
		opensBeforeMinutes: null,
		closesAfterMinutes: null,
	};

	test("el rango pide las dos tolerancias", () => {
		expect(
			v.safeParse(saveFollowUpRule, { ...base, availability: "RANGE" }).success,
		).toBe(false);
		expect(
			v.safeParse(saveFollowUpRule, {
				...base,
				availability: "RANGE",
				opensBeforeMinutes: 10,
				closesAfterMinutes: 10,
			}).success,
		).toBe(true);
	});

	test("al terminar pide cuánto queda abierta", () => {
		expect(
			v.safeParse(saveFollowUpRule, { ...base, availability: "SESSION_END" })
				.success,
		).toBe(false);
	});

	test("el minuto que falta se reporta en su campo, con su mensaje", () => {
		const range = v.safeParse(saveFollowUpRule, {
			...base,
			availability: "RANGE",
			closesAfterMinutes: 10,
		});
		const sessionEnd = v.safeParse(saveFollowUpRule, {
			...base,
			availability: "SESSION_END",
		});

		expect(toFieldErrors(range.issues ?? [])).toEqual({
			opensBeforeMinutes:
				"Indica cuántos minutos antes del inicio se abre la evaluación.",
		});
		expect(toFieldErrors(sessionEnd.issues ?? [])).toEqual({
			closesAfterMinutes:
				"Indica cuántos minutos después del fin queda abierta la evaluación.",
		});
	});

	test("la configuración pide nombre", () => {
		expect(
			v.safeParse(saveFollowUpRule, {
				...base,
				availability: "MANUAL",
				title: " ",
			}).success,
		).toBe(false);
	});

	// Las preguntas viajan aparte, con el paso, como las del examen final.
	test("las preguntas piden al menos una", () => {
		const followUpDocumentId = "44444444-4444-4444-8444-444444444444";
		expect(
			v.safeParse(saveFollowUpQuestionsRule, { followUpDocumentId, questions })
				.success,
		).toBe(true);
		expect(
			v.safeParse(saveFollowUpQuestionsRule, {
				followUpDocumentId,
				questions: [],
			}).success,
		).toBe(false);
	});

	test("sin identificador, se crea", () => {
		const parsed = v.parse(saveFollowUpRule, {
			...base,
			availability: "MANUAL",
		});
		expect(parsed.followUpDocumentId).toBeNull();
	});

	test("solo se guardan los minutos que usa el modo", () => {
		expect(
			toFollowUpSettingsWrite({
				countsTowardGrade: true,
				availability: "SESSION_START",
				opensBeforeMinutes: 10,
				closesAfterMinutes: 20,
			}),
		).toEqual({
			countsTowardGrade: true,
			availability: "SESSION_START",
			opensBeforeMinutes: null,
			closesAfterMinutes: null,
		});
	});
});
