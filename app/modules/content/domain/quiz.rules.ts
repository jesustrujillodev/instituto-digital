import * as v from "valibot";
import {
	type CourseCompletionRule,
	countsContent,
} from "@/modules/courses/domain/course.rules";
import {
	QUIZ_MAX_QUESTIONS,
	QUIZ_OPTION_MAX_LENGTH,
	QUIZ_OPTIONS_RANGE,
	QUIZ_POINTS_RANGE,
	QUIZ_STATEMENT_MAX_LENGTH,
	QUIZ_TITLE_MAX_LENGTH,
	TRUE_FALSE_LABELS,
} from "./content.config";
import {
	ContentQuizAlreadyTakenError,
	ContentQuizIncompleteError,
	ContentQuizLockedError,
	ContentQuizNotAvailableError,
	ContentQuizRetakeNotAllowedError,
} from "./content.errors";
import type {
	GradedAttempt,
	QuizBank,
	QuizBankWrite,
	QuizOutcome,
	QuizOwnerRef,
	QuizSheet,
	SaveQuizDto,
	StoredAttempt,
	StoredQuiz,
} from "./quiz.types";

export const QUIZ_QUESTION_TYPES = ["SINGLE_CHOICE", "TRUE_FALSE"] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

/** Si quien lo presenta puede hacerlo ya, todavía no, o ya lo hizo. */
export const QUIZ_AVAILABILITIES = [
	"AVAILABLE",
	"LOCKED_BY_CONTENT",
	"TAKEN",
] as const;
export type QuizAvailability = (typeof QUIZ_AVAILABILITIES)[number];

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

/** De quién cuelga un cuestionario, y con ello qué hace al enviarse. */
export const QUIZ_KINDS = ["FINAL", "PRACTICE", "MODULE"] as const;
export type QuizKind = (typeof QUIZ_KINDS)[number];

export const quizKindOf = (owner: QuizOwnerRef): QuizKind => {
	if (owner.lessonDocumentId !== null) return "PRACTICE";
	if (owner.moduleDocumentId !== null) return "MODULE";
	return "FINAL";
};

export const FINAL_QUIZ_OWNER: QuizOwnerRef = {
	lessonDocumentId: null,
	moduleDocumentId: null,
};

// ── Contratos de entrada ──────────────────────────────────────────────────────

/**
 * Los dos nulos: el examen final del curso. Con lección, la práctica de esa
 * lección `QUIZ`; con módulo, la evaluación de ese módulo. Nunca los dos.
 */
const owner = {
	lessonDocumentId: v.nullable(documentId),
	moduleDocumentId: v.optional(v.nullable(documentId), null),
};

const ownedBySingleParent = <T extends QuizOwnerRef>(entry: T) =>
	entry.lessonDocumentId === null || entry.moduleDocumentId === null;

const OWNER_CONFLICT_MESSAGE =
	"Un cuestionario cuelga de una lección o de un módulo, no de los dos.";

const title = v.pipe(
	v.string("El título del cuestionario es obligatorio."),
	v.trim(),
	v.minLength(1, "Escribe el título del cuestionario."),
	v.maxLength(
		QUIZ_TITLE_MAX_LENGTH,
		`El título no puede superar los ${QUIZ_TITLE_MAX_LENGTH} caracteres.`,
	),
);

const option = v.object({
	text: v.pipe(
		v.string("Escribe el texto de la opción."),
		v.trim(),
		v.minLength(1, "Escribe el texto de la opción."),
		v.maxLength(
			QUIZ_OPTION_MAX_LENGTH,
			`Una opción no puede superar los ${QUIZ_OPTION_MAX_LENGTH} caracteres.`,
		),
	),
	isCorrect: v.boolean("Indica si la opción es la correcta."),
});

const question = v.pipe(
	v.object({
		statement: v.pipe(
			v.string("Escribe el enunciado de la pregunta."),
			v.trim(),
			v.minLength(1, "Escribe el enunciado de la pregunta."),
			v.maxLength(
				QUIZ_STATEMENT_MAX_LENGTH,
				`El enunciado no puede superar los ${QUIZ_STATEMENT_MAX_LENGTH} caracteres.`,
			),
		),
		type: v.picklist(QUIZ_QUESTION_TYPES, "Elige un tipo de pregunta válido."),
		points: v.pipe(
			v.number("Los puntos deben ser un número."),
			v.integer("Los puntos deben ser un número entero."),
			v.minValue(
				QUIZ_POINTS_RANGE.min,
				`Una pregunta vale al menos ${QUIZ_POINTS_RANGE.min} punto.`,
			),
			v.maxValue(
				QUIZ_POINTS_RANGE.max,
				`Una pregunta vale como máximo ${QUIZ_POINTS_RANGE.max} puntos.`,
			),
		),
		options: v.array(option, "Agrega las opciones de la pregunta."),
	}),
	v.check(
		(entry) => entry.options.filter((row) => row.isCorrect).length === 1,
		"Cada pregunta tiene exactamente una opción correcta.",
	),
	v.check(
		(entry) =>
			entry.type === "TRUE_FALSE"
				? entry.options.length === TRUE_FALSE_LABELS.length
				: entry.options.length >= QUIZ_OPTIONS_RANGE.min &&
					entry.options.length <= QUIZ_OPTIONS_RANGE.max,
		`Una pregunta de opción única lleva entre ${QUIZ_OPTIONS_RANGE.min} y ${QUIZ_OPTIONS_RANGE.max} opciones.`,
	),
);

export const saveQuizRule = v.pipe(
	v.object({
		...owner,
		title,
		passingScore: v.pipe(
			v.number("La calificación mínima debe ser un número."),
			v.integer("La calificación mínima debe ser un número entero."),
			v.minValue(0, "La calificación mínima va de 0 a 100."),
			v.maxValue(100, "La calificación mínima va de 0 a 100."),
		),
		shuffleQuestions: v.boolean("Indica si las preguntas se barajan."),
		questions: v.pipe(
			v.array(question, "Agrega las preguntas del cuestionario."),
			v.minLength(1, "Agrega al menos una pregunta."),
			v.maxLength(
				QUIZ_MAX_QUESTIONS,
				`Un cuestionario no puede tener más de ${QUIZ_MAX_QUESTIONS} preguntas.`,
			),
		),
	}),
	v.check(ownedBySingleParent, OWNER_CONFLICT_MESSAGE),
);

export const renameQuizRule = v.pipe(
	v.object({ ...owner, title }),
	v.check(ownedBySingleParent, OWNER_CONFLICT_MESSAGE),
);

export const findQuizRule = v.pipe(
	v.object(owner),
	v.check(ownedBySingleParent, OWNER_CONFLICT_MESSAGE),
);

export const submitQuizRule = v.pipe(
	v.object({
		...owner,
		answers: v.pipe(
			v.array(
				v.object({
					questionDocumentId: documentId,
					optionDocumentId: documentId,
				}),
				"Revisa tus respuestas.",
			),
			v.maxLength(QUIZ_MAX_QUESTIONS, "Hay más respuestas que preguntas."),
		),
	}),
	v.check(ownedBySingleParent, OWNER_CONFLICT_MESSAGE),
);

export const moduleQuizRule = v.object({ moduleDocumentId: documentId });

export const grantRetakeRule = v.object({
	moduleDocumentId: documentId,
	userDocumentId: documentId,
});

export const quizRules = {
	find: findQuizRule,
	save: saveQuizRule,
	rename: renameQuizRule,
	submit: submitQuizRule,
	archiveModuleQuiz: moduleQuizRule,
	grantRetake: grantRetakeRule,
} as const;

// ── El banco ──────────────────────────────────────────────────────────────────

/** Verdadero o falso lleva siempre las mismas dos opciones, en este orden. */
export const toTrueFalseOptions = (correctIndex: number) =>
	TRUE_FALSE_LABELS.map((text, index) => ({
		text,
		isCorrect: index === correctIndex,
	}));

/** Lo que se escribe: verdadero o falso con su texto fijo, lo demás tal cual. */
export const toQuizBankWrite = (dto: SaveQuizDto): QuizBankWrite => ({
	title: dto.title,
	passingScore: dto.passingScore,
	shuffleQuestions: dto.shuffleQuestions,
	questions: dto.questions.map((entry) => ({
		statement: entry.statement,
		type: entry.type,
		points: entry.points,
		options:
			entry.type === "TRUE_FALSE"
				? toTrueFalseOptions(entry.options.findIndex((row) => row.isCorrect))
				: entry.options.map((row) => ({ ...row })),
	})),
});

/**
 * Con un intento enviado, el banco se congela: cambiarlo haría incomparables
 * las notas ya dadas. El título sigue editándose por su cuenta.
 */
export const assertBankEditable = (attemptCount: number): void => {
	if (attemptCount > 0) throw new ContentQuizLockedError();
};

export const toQuizBank = (
	quiz: StoredQuiz,
	attemptCount: number,
): QuizBank => ({
	documentId: quiz.documentId,
	title: quiz.title,
	passingScore: quiz.passingScore,
	shuffleQuestions: quiz.shuffleQuestions,
	questions: quiz.questions.map((entry) => ({
		documentId: entry.documentId,
		statement: entry.statement,
		type: entry.type,
		points: entry.points,
		options: entry.options.map((row) => ({
			documentId: row.documentId,
			text: row.text,
			isCorrect: row.isCorrect,
		})),
	})),
	attemptCount,
});

// ── Presentarlo ───────────────────────────────────────────────────────────────

/**
 * El examen final de un curso que cuenta contenido espera a que se terminen las
 * obligatorias. Uno que no lo cuenta está disponible desde la inscripción.
 */
export const quizAvailabilityOf = (
	course: { completionRule: CourseCompletionRule },
	contentCompletedAt: Date | null,
	latestAttempt: StoredAttempt | null,
	isFinal: boolean,
): QuizAvailability => {
	if (latestAttempt && !latestAttempt.retakeGrantedAt) return "TAKEN";
	if (isFinal && countsContent(course.completionRule) && !contentCompletedAt) {
		return "LOCKED_BY_CONTENT";
	}
	return "AVAILABLE";
};

/** El número del siguiente intento: la unicidad por número frena el doble envío. */
export const nextAttemptNumberOf = (latestAttempt: StoredAttempt | null) =>
	(latestAttempt?.number ?? 0) + 1;

/**
 * Otro intento solo sobre el último, reprobado y sin uno ya habilitado. Uno
 * aprobado no se repite: su nota ya respalda el avance.
 */
export const assertRetakeGrantable = (
	latestAttempt: StoredAttempt | null,
): StoredAttempt => {
	if (
		!latestAttempt ||
		latestAttempt.passed ||
		latestAttempt.retakeGrantedAt !== null
	) {
		throw new ContentQuizRetakeNotAllowedError();
	}
	return latestAttempt;
};

export const assertCanSubmit = (availability: QuizAvailability): void => {
	if (availability === "TAKEN") throw new ContentQuizAlreadyTakenError();
	if (availability === "LOCKED_BY_CONTENT") {
		throw new ContentQuizNotAvailableError();
	}
};

/** Generador determinista (mulberry32): la misma semilla, el mismo orden. */
const seededRandom = (seed: string) => {
	let state = 0;
	for (const char of seed)
		state = (Math.imul(31, state) + char.charCodeAt(0)) | 0;

	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index--) {
		const pick = Math.floor(random() * (index + 1));
		[copy[index], copy[pick]] = [copy[pick] as T, copy[index] as T];
	}
	return copy;
};

/**
 * Lo que ve quien lo presenta: sin `isCorrect`. Si se baraja, la semilla es la
 * persona y el cuestionario, para que recargar no cambie el orden.
 */
export const toQuizSheet = (quiz: StoredQuiz, seed: string): QuizSheet => {
	const random = seededRandom(seed);
	const questions = quiz.shuffleQuestions
		? shuffled(quiz.questions, random)
		: quiz.questions;

	return {
		documentId: quiz.documentId,
		title: quiz.title,
		passingScore: quiz.passingScore,
		totalPoints: quiz.questions.reduce((sum, entry) => sum + entry.points, 0),
		questions: questions.map((entry) => ({
			documentId: entry.documentId,
			statement: entry.statement,
			type: entry.type,
			points: entry.points,
			options: entry.options.map((row) => ({
				documentId: row.documentId,
				text: row.text,
			})),
		})),
	};
};

/**
 * La nota en enteros y hacia abajo: `floor(acertados × 100 / total)`. Cada
 * pregunta necesita exactamente una respuesta, y la opción tiene que ser suya.
 */
export const gradeAttempt = (
	quiz: StoredQuiz,
	answers: readonly { questionDocumentId: string; optionDocumentId: string }[],
): GradedAttempt => {
	const answerOf = new Map<string, string>();
	for (const answer of answers) {
		if (answerOf.has(answer.questionDocumentId)) {
			throw new ContentQuizIncompleteError();
		}
		answerOf.set(answer.questionDocumentId, answer.optionDocumentId);
	}
	if (answerOf.size !== quiz.questions.length) {
		throw new ContentQuizIncompleteError();
	}

	let earned = 0;
	let total = 0;
	const graded = quiz.questions.map((entry) => {
		const chosen = entry.options.find(
			(row) => row.documentId === answerOf.get(entry.documentId),
		);
		if (!chosen) throw new ContentQuizIncompleteError();

		total += entry.points;
		if (chosen.isCorrect) earned += entry.points;

		return {
			questionId: entry.id,
			optionId: chosen.id,
			isCorrect: chosen.isCorrect,
		};
	});

	const score = total === 0 ? 0 : Math.floor((earned * 100) / total);

	return { score, passed: score >= quiz.passingScore, answers: graded };
};

/** El resultado sin la opción correcta: solo si cada pregunta se acertó. */
export const toQuizOutcome = (
	quiz: StoredQuiz,
	attempt: Pick<StoredAttempt, "submittedAt" | "score" | "passed" | "answers">,
): QuizOutcome => {
	const correctOf = new Map(
		attempt.answers.map((answer) => [answer.questionId, answer.isCorrect]),
	);

	return {
		score: attempt.score,
		passed: attempt.passed,
		passingScore: quiz.passingScore,
		submittedAt: attempt.submittedAt,
		questions: quiz.questions.map((entry) => ({
			documentId: entry.documentId,
			statement: entry.statement,
			correct: correctOf.get(entry.id) ?? false,
		})),
	};
};
