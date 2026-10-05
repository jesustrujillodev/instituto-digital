import * as v from "valibot";
import {
	type CourseCompletionRule,
	type CourseStatus,
	countsContent,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentResult } from "@/modules/enrollments/domain/enrollment.config";
import {
	FOLLOW_UP_MINUTES_RANGE,
	QUIZ_ATTEMPTS_RANGE,
	QUIZ_MAX_QUESTIONS,
	QUIZ_OPTION_MAX_LENGTH,
	QUIZ_OPTIONS_RANGE,
	QUIZ_POINTS_RANGE,
	QUIZ_STATEMENT_MAX_LENGTH,
	QUIZ_TITLE_MAX_LENGTH,
	TRUE_FALSE_LABELS,
} from "./content.config";
import {
	ContentFollowUpNotAttendedError,
	ContentFollowUpNotOpenError,
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

/**
 * Si quien lo presenta puede hacerlo ya, todavía no, o ya lo hizo. Los tres
 * últimos son solo del seguimiento (docs/adr/0027).
 */
export const QUIZ_AVAILABILITIES = [
	"AVAILABLE",
	"LOCKED_BY_CONTENT",
	"TAKEN",
	"NOT_YET",
	"CLOSED",
	"NOT_ATTENDED",
] as const;
export type QuizAvailability = (typeof QUIZ_AVAILABILITIES)[number];

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

/** De quién cuelga un cuestionario, y con ello qué hace al enviarse. */
export const QUIZ_KINDS = ["FINAL", "PRACTICE", "MODULE", "FOLLOW_UP"] as const;
export type QuizKind = (typeof QUIZ_KINDS)[number];

export const quizKindOf = (owner: QuizOwnerRef): QuizKind => {
	if (owner.lessonDocumentId !== null) return "PRACTICE";
	if (owner.moduleDocumentId !== null) return "MODULE";
	if (owner.followUpDocumentId) return "FOLLOW_UP";
	return "FINAL";
};

/** Cuándo se abre una evaluación de seguimiento (docs/adr/0027). */
export const FOLLOW_UP_AVAILABILITY_MODES = [
	"SESSION_START",
	"SESSION_END",
	"RANGE",
	"MANUAL",
] as const;
export type FollowUpAvailabilityMode =
	(typeof FOLLOW_UP_AVAILABILITY_MODES)[number];

export const FINAL_QUIZ_OWNER: QuizOwnerRef = {
	lessonDocumentId: null,
	moduleDocumentId: null,
	followUpDocumentId: null,
};

/** El dueño de una evaluación de seguimiento. */
export const followUpOwnerOf = (followUpDocumentId: string): QuizOwnerRef => ({
	lessonDocumentId: null,
	moduleDocumentId: null,
	followUpDocumentId,
});

// ── Contratos de entrada ──────────────────────────────────────────────────────

/**
 * Los tres nulos: el examen final del curso. Con lección, la práctica de esa
 * lección `QUIZ`; con módulo, la evaluación de ese módulo; con seguimiento, esa
 * evaluación de seguimiento. Nunca más de uno.
 */
const owner = {
	lessonDocumentId: v.nullable(documentId),
	moduleDocumentId: v.optional(v.nullable(documentId), null),
	followUpDocumentId: v.optional(v.nullable(documentId), null),
};

const ownedBySingleParent = <T extends QuizOwnerRef>(entry: T) =>
	[
		entry.lessonDocumentId,
		entry.moduleDocumentId,
		entry.followUpDocumentId ?? null,
	].filter((id) => id !== null).length <= 1;

const OWNER_CONFLICT_MESSAGE =
	"Un cuestionario cuelga de una lección, de un módulo o de una sesión, no de varios.";

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

/** Los datos del cuestionario, sin sus preguntas. */
const bankFields = {
	title,
	passingScore: v.pipe(
		v.number("La calificación mínima debe ser un número."),
		v.integer("La calificación mínima debe ser un número entero."),
		v.minValue(0, "La calificación mínima va de 0 a 100."),
		v.maxValue(100, "La calificación mínima va de 0 a 100."),
	),
	/** `null`: sin límite. */
	maxAttempts: v.nullable(
		v.pipe(
			v.number("Los intentos deben ser un número."),
			v.integer("Los intentos deben ser un número entero."),
			v.minValue(
				QUIZ_ATTEMPTS_RANGE.min,
				`Los intentos van de ${QUIZ_ATTEMPTS_RANGE.min} a ${QUIZ_ATTEMPTS_RANGE.max}, o sin límite.`,
			),
			v.maxValue(
				QUIZ_ATTEMPTS_RANGE.max,
				`Los intentos van de ${QUIZ_ATTEMPTS_RANGE.min} a ${QUIZ_ATTEMPTS_RANGE.max}, o sin límite.`,
			),
		),
	),
	shuffleQuestions: v.boolean("Indica si las preguntas se barajan."),
};

const questions = v.pipe(
	v.array(question, "Agrega las preguntas del cuestionario."),
	v.minLength(1, "Agrega al menos una pregunta."),
	v.maxLength(
		QUIZ_MAX_QUESTIONS,
		`Un cuestionario no puede tener más de ${QUIZ_MAX_QUESTIONS} preguntas.`,
	),
);

export const saveQuizRule = v.pipe(
	v.object({ ...owner, ...bankFields, questions }),
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

export const grantRetakeRule = v.pipe(
	v.object({ ...owner, userDocumentId: documentId }),
	v.check(ownedBySingleParent, OWNER_CONFLICT_MESSAGE),
);

const followUpMinutes = (label: string) =>
	v.nullable(
		v.pipe(
			v.number(`Los minutos ${label} deben ser un número.`),
			v.integer(`Los minutos ${label} deben ser un número entero.`),
			v.minValue(
				FOLLOW_UP_MINUTES_RANGE.min,
				`Los minutos ${label} no pueden ser negativos.`,
			),
			v.maxValue(
				FOLLOW_UP_MINUTES_RANGE.max,
				`Los minutos ${label} no pueden pasar de ${FOLLOW_UP_MINUTES_RANGE.max}.`,
			),
		),
	);

const followUpSettings = {
	sessionDocumentId: v.pipe(
		v.string("Elige la sesión de la evaluación."),
		v.uuid("Elige una sesión válida."),
	),
	countsTowardGrade: v.boolean(
		"Indica si la evaluación cuenta para la calificación.",
	),
	availability: v.picklist(
		FOLLOW_UP_AVAILABILITY_MODES,
		"Elige cuándo se abre la evaluación.",
	),
	opensBeforeMinutes: followUpMinutes("antes del inicio"),
	closesAfterMinutes: followUpMinutes("después del fin"),
};

/** El rango pide las dos tolerancias; «al terminar», cuánto dura abierta. */
const hasRequiredMinutes = <
	T extends {
		availability: FollowUpAvailabilityMode;
		opensBeforeMinutes: number | null;
		closesAfterMinutes: number | null;
	},
>(
	entry: T,
) => {
	if (entry.availability === "RANGE") {
		return (
			entry.opensBeforeMinutes !== null && entry.closesAfterMinutes !== null
		);
	}
	if (entry.availability === "SESSION_END") {
		return entry.closesAfterMinutes !== null;
	}
	return true;
};

const MISSING_MINUTES_MESSAGE =
	"Indica los minutos de la ventana en que estará abierta la evaluación.";

/**
 * La configuración de una evaluación de seguimiento, la del modal: sus datos y
 * cuándo se abre, sin las preguntas. Sin `followUpDocumentId`, se crea.
 */
export const saveFollowUpRule = v.pipe(
	v.object({
		followUpDocumentId: v.optional(v.nullable(documentId), null),
		...bankFields,
		...followUpSettings,
	}),
	v.check(hasRequiredMinutes, MISSING_MINUTES_MESSAGE),
);

/** Sus preguntas, que se guardan con el paso, como las del examen final. */
export const saveFollowUpQuestionsRule = v.object({
	followUpDocumentId: documentId,
	questions,
});

export const followUpRule = v.object({ followUpDocumentId: documentId });

export const quizRules = {
	find: findQuizRule,
	save: saveQuizRule,
	rename: renameQuizRule,
	submit: submitQuizRule,
	deleteModuleQuiz: moduleQuizRule,
	grantRetake: grantRetakeRule,
	saveFollowUp: saveFollowUpRule,
	saveFollowUpQuestions: saveFollowUpQuestionsRule,
	followUp: followUpRule,
} as const;

/** Solo se guardan los minutos que el modo usa: así lo guardado no miente. */
export const toFollowUpSettingsWrite = (dto: {
	countsTowardGrade: boolean;
	availability: FollowUpAvailabilityMode;
	opensBeforeMinutes: number | null;
	closesAfterMinutes: number | null;
}) => ({
	countsTowardGrade: dto.countsTowardGrade,
	availability: dto.availability,
	opensBeforeMinutes:
		dto.availability === "RANGE" ? dto.opensBeforeMinutes : null,
	closesAfterMinutes:
		dto.availability === "RANGE" || dto.availability === "SESSION_END"
			? dto.closesAfterMinutes
			: null,
});

// ── El banco ──────────────────────────────────────────────────────────────────

/** Verdadero o falso lleva siempre las mismas dos opciones, en este orden. */
export const toTrueFalseOptions = (correctIndex: number) =>
	TRUE_FALSE_LABELS.map((text, index) => ({
		text,
		isCorrect: index === correctIndex,
	}));

/** Lo que se escribe: verdadero o falso con su texto fijo, lo demás tal cual. */
export const toQuizBankWrite = (
	dto: Pick<
		SaveQuizDto,
		"title" | "passingScore" | "maxAttempts" | "shuffleQuestions" | "questions"
	>,
): QuizBankWrite => ({
	title: dto.title,
	passingScore: dto.passingScore,
	maxAttempts: dto.maxAttempts,
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
	maxAttempts: quiz.maxAttempts,
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

/** Lo que decide si un intento reprobado se puede repetir. */
export type AttemptSummary = Pick<
	StoredAttempt,
	"number" | "passed" | "retakeGrantedAt"
>;

/**
 * Los intentos que le quedan a alguien, contando el que le hayan habilitado:
 * `null` sin límite. Los números son consecutivos desde 1, así que el último
 * dice cuántos lleva.
 */
export const attemptsLeftOf = (
	maxAttempts: number | null,
	latestAttempt: Pick<StoredAttempt, "number" | "retakeGrantedAt"> | null,
): number | null => {
	if (maxAttempts === null) return null;
	const granted = latestAttempt?.retakeGrantedAt ? 1 : 0;
	return Math.max(0, maxAttempts - (latestAttempt?.number ?? 0)) + granted;
};

const hasAttemptsLeft = (
	maxAttempts: number | null,
	latestAttempt: AttemptSummary,
) => attemptsLeftOf(maxAttempts, latestAttempt) !== 0;

/**
 * Ya acreditó el curso: su nota quedó fija. Quien completó antes de que el
 * resultado se escribiera solo también cuenta (docs/adr/0024).
 */
export const isAccredited = (enrollment: {
	result: EnrollmentResult;
	completed: boolean;
}): boolean => enrollment.result === "PASSED" || enrollment.completed;

/** Un intento reprobado se repite mientras queden intentos y no se acredite. */
const isReopened = (
	enrollment: { result: EnrollmentResult; completed: boolean } | null,
	latestAttempt: AttemptSummary,
	maxAttempts: number | null,
) =>
	!latestAttempt.passed &&
	!(enrollment && isAccredited(enrollment)) &&
	hasAttemptsLeft(maxAttempts, latestAttempt);

/**
 * El examen final de un curso que cuenta contenido espera a que se terminen las
 * obligatorias. Uno que no lo cuenta está disponible desde la inscripción.
 *
 * Una evaluación aprobada se cierra. Una reprobada se reintenta mientras queden
 * intentos o alguien habilite otro, y se cierra en cuanto el curso se acredita:
 * la nota ya quedó fija (docs/adr/0024).
 */
export const quizAvailabilityOf = (
	course: { completionRule: CourseCompletionRule },
	enrollment: {
		contentCompletedAt: Date | null;
		result: EnrollmentResult;
		completed: boolean;
	} | null,
	latestAttempt: AttemptSummary | null,
	kind: QuizKind,
	maxAttempts: number | null,
): QuizAvailability => {
	if (latestAttempt && !isReopened(enrollment, latestAttempt, maxAttempts)) {
		return "TAKEN";
	}
	if (
		kind === "FINAL" &&
		countsContent(course.completionRule) &&
		!enrollment?.contentCompletedAt
	) {
		return "LOCKED_BY_CONTENT";
	}
	return "AVAILABLE";
};

/**
 * La calificación del curso: el promedio de la mejor nota de cada evaluación
 * que cuenta, en enteros y hacia abajo como `gradeAttempt`. `null` si no hay
 * ninguna.
 */
export const courseGradeOf = (scores: readonly number[]): number | null =>
	scores.length === 0
		? null
		: Math.floor(scores.reduce((sum, score) => sum + score, 0) / scores.length);

/**
 * Se acredita con el promedio, no evaluación por evaluación: una reprobada se
 * compensa con las demás (docs/adr/0024).
 */
export const courseResultOf = (
	grade: number,
	minPassingGrade: number,
): "PASSED" | "FAILED" => (grade >= minPassingGrade ? "PASSED" : "FAILED");

/** El número del siguiente intento: la unicidad por número frena el doble envío. */
export const nextAttemptNumberOf = (latestAttempt: StoredAttempt | null) =>
	(latestAttempt?.number ?? 0) + 1;

/**
 * Otro intento solo sobre el último, reprobado, con los intentos agotados y
 * sin uno ya habilitado. Uno aprobado no se repite: su nota ya cuenta.
 */
export const canGrantRetakeOn = (
	latestAttempt: AttemptSummary | null,
	maxAttempts: number | null,
): boolean =>
	latestAttempt !== null &&
	!latestAttempt.passed &&
	latestAttempt.retakeGrantedAt === null &&
	!hasAttemptsLeft(maxAttempts, latestAttempt);

export const assertRetakeGrantable = <T extends AttemptSummary>(
	latestAttempt: T | null,
	maxAttempts: number | null,
): T => {
	if (!latestAttempt || !canGrantRetakeOn(latestAttempt, maxAttempts)) {
		throw new ContentQuizRetakeNotAllowedError();
	}
	return latestAttempt;
};

export const assertCanSubmit = (availability: QuizAvailability): void => {
	switch (availability) {
		case "AVAILABLE":
			return;
		case "TAKEN":
			throw new ContentQuizAlreadyTakenError();
		case "LOCKED_BY_CONTENT":
			throw new ContentQuizNotAvailableError();
		case "NOT_YET":
		case "CLOSED":
			throw new ContentFollowUpNotOpenError();
		case "NOT_ATTENDED":
			throw new ContentFollowUpNotAttendedError();
	}
};

// ── Evaluaciones de seguimiento (docs/adr/0027) ──────────────────────────────

const MINUTE_MS = 60_000;

const plusMinutes = (at: Date, minutes: number) =>
	new Date(at.getTime() + minutes * MINUTE_MS);

/** Cuándo abre y cierra; `null` es que todavía no se sabe (modo manual). */
export const followUpWindowOf = (
	followUp: {
		availability: FollowUpAvailabilityMode;
		opensBeforeMinutes: number | null;
		closesAfterMinutes: number | null;
		openedAt: Date | null;
		closedAt: Date | null;
	},
	session: { startsAt: Date; endsAt: Date },
): { opensAt: Date | null; closesAt: Date | null } => {
	switch (followUp.availability) {
		case "SESSION_START":
			return { opensAt: session.startsAt, closesAt: session.endsAt };
		case "SESSION_END":
			return {
				opensAt: session.endsAt,
				closesAt: plusMinutes(session.endsAt, followUp.closesAfterMinutes ?? 0),
			};
		case "RANGE":
			return {
				opensAt: plusMinutes(
					session.startsAt,
					-(followUp.opensBeforeMinutes ?? 0),
				),
				closesAt: plusMinutes(session.endsAt, followUp.closesAfterMinutes ?? 0),
			};
		case "MANUAL":
			return { opensAt: followUp.openedAt, closesAt: followUp.closedAt };
	}
};

export const FOLLOW_UP_STATES = ["SCHEDULED", "OPEN", "CLOSED"] as const;
export type FollowUpState = (typeof FOLLOW_UP_STATES)[number];

/** Toda ventana se cierra también cuando el curso deja de impartirse. */
export const followUpStateOf = (
	window: { opensAt: Date | null; closesAt: Date | null },
	courseStatus: CourseStatus,
	now: Date,
): FollowUpState => {
	if (courseStatus !== "PUBLISHED") return "CLOSED";
	if (window.closesAt && now >= window.closesAt) return "CLOSED";
	if (!window.opensAt || now < window.opensAt) return "SCHEDULED";
	return "OPEN";
};

/**
 * Lo que puede hacer quien lo presenta. Los intentos siguen las reglas del
 * resto de cuestionarios; además, la ventana tiene que estar abierta y la
 * persona tiene que haber registrado asistencia en la sesión.
 */
export const followUpAvailabilityOf = (
	state: FollowUpState,
	attended: boolean,
	enrollment: { result: EnrollmentResult; completed: boolean } | null,
	latestAttempt: AttemptSummary | null,
	maxAttempts: number | null,
): QuizAvailability => {
	if (latestAttempt && !isReopened(enrollment, latestAttempt, maxAttempts)) {
		return "TAKEN";
	}
	if (state === "SCHEDULED") return "NOT_YET";
	if (state === "CLOSED") return "CLOSED";
	if (!attended) return "NOT_ATTENDED";
	return "AVAILABLE";
};

/** Lo que una evaluación de seguimiento aporta al promedio de una persona. */
export interface FollowUpScore {
	countsTowardGrade: boolean;
	closed: boolean;
	best: number | null;
}

/**
 * Las notas que promedia la calificación del curso: el temario que cuenta, el
 * examen final y el seguimiento que cuenta. Un seguimiento que cuenta y cerró
 * sin intento vale 0; mientras siga abierto, todavía no entra.
 */
export const courseScoresOf = (parts: {
	content: readonly number[];
	finalBest: number | null;
	followUps: readonly FollowUpScore[];
}): number[] => [
	...parts.content,
	...(parts.finalBest === null ? [] : [parts.finalBest]),
	...parts.followUps.flatMap((followUp) => {
		if (!followUp.countsTowardGrade) return [];
		if (followUp.best !== null) return [followUp.best];
		return followUp.closed ? [0] : [];
	}),
];

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
export const toQuizSheet = (
	quiz: StoredQuiz,
	seed: string,
	attemptsLeft: number | null,
): QuizSheet => {
	const random = seededRandom(seed);
	const questions = quiz.shuffleQuestions
		? shuffled(quiz.questions, random)
		: quiz.questions;

	return {
		documentId: quiz.documentId,
		title: quiz.title,
		passingScore: quiz.passingScore,
		attemptsLeft,
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
 * Los puntos mínimos para aprobar: el menor acierto cuya nota, calculada como
 * en `gradeAttempt`, alcanza la mínima. Con la nota hacia abajo, eso es
 * redondear hacia arriba `mínima × total / 100`.
 */
export const pointsToPass = (totalPoints: number, passingScore: number) =>
	Math.ceil((passingScore * totalPoints) / 100);

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
