import * as v from "valibot";
import { startOfZonedDay, zonedYearOf } from "@/lib/date-utils";
import {
	countsAttendance,
	countsContent,
	evaluatesByQuiz,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import type { CreditCandidate } from "@/modules/credits/domain/credit.types";
import { ENROLLMENT_RESULTS } from "@/modules/enrollments/domain/enrollment.config";
import type { ResultWrite } from "@/modules/enrollments/domain/enrollment.types";
import { createListRule, SORT_DIRECTIONS } from "@/shared/rules/list.rules";
import { canCorrect, type TeachingScope } from "./teaching.access";
import {
	type FinishBlocker,
	TEACHABLE_STATUSES,
	TEACHING_BATCH_LIMIT,
	TEACHING_SORT_FIELDS,
} from "./teaching.config";
import {
	TeachingCorrectionForbiddenError,
	TeachingCourseNotFoundError,
	TeachingEvaluationNotRequiredError,
	TeachingFinishTooEarlyError,
	TeachingNotPublishedError,
	TeachingNotSelfPacedError,
	TeachingPendingResultsError,
	TeachingResultsByQuizError,
	TeachingSelfPacedNotFinishableError,
	TeachingUnknownParticipantError,
	TeachingWithoutSessionsError,
} from "./teaching.errors";
import type {
	SaveAttendanceDto,
	SaveResultsDto,
	TeachingCourse,
	TeachingParticipant,
	TeachingSession,
} from "./teaching.types";

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const findTeachingCourseRule = v.object({ documentId });

export const listTeachingCoursesRule = createListRule({
	status: v.optional(v.picklist(TEACHABLE_STATUSES, "El estado no es válido.")),
	sortBy: v.optional(
		v.picklist(TEACHING_SORT_FIELDS, "No se puede ordenar por ese campo."),
	),
	sortDir: v.optional(
		v.picklist(SORT_DIRECTIONS, "El sentido de ordenación no es válido."),
	),
});

export const saveAttendanceRule = v.object({
	sessionDocumentId: documentId,
	marks: v.pipe(
		v.array(
			v.object({
				userDocumentId: documentId,
				attended: v.boolean("Indica si la persona asistió."),
			}),
			"Revisa el pase de lista.",
		),
		v.minLength(1, "Marca la asistencia de al menos una persona."),
		v.maxLength(
			TEACHING_BATCH_LIMIT,
			`No puedes guardar más de ${TEACHING_BATCH_LIMIT} marcas a la vez.`,
		),
	),
});

export const GRADE_RANGE = { min: 0, max: 100 } as const;

const resultEntry = v.pipe(
	v.object({
		userDocumentId: documentId,
		result: v.picklist(ENROLLMENT_RESULTS, "Elige un resultado válido."),
		grade: v.optional(
			v.nullable(
				v.pipe(
					v.number("La calificación debe ser un número."),
					v.integer("La calificación debe ser un número entero."),
					v.minValue(
						GRADE_RANGE.min,
						`La calificación mínima es ${GRADE_RANGE.min}.`,
					),
					v.maxValue(
						GRADE_RANGE.max,
						`La calificación máxima es ${GRADE_RANGE.max}.`,
					),
				),
			),
			null,
		),
	}),
	v.check(
		(entry) => entry.result !== "PENDING" || entry.grade === null,
		"La nota solo acompaña a un resultado capturado.",
	),
);

export const saveResultsRule = v.object({
	entries: v.pipe(
		v.array(resultEntry, "Revisa la captura de resultados."),
		v.minLength(1, "Captura al menos un resultado."),
		v.maxLength(
			TEACHING_BATCH_LIMIT,
			`No puedes guardar más de ${TEACHING_BATCH_LIMIT} resultados a la vez.`,
		),
	),
});

export const setEnrollmentOpenRule = v.object({
	open: v.boolean("Indica si la inscripción queda abierta o cerrada."),
});

export const teachingRules = {
	find: findTeachingCourseRule,
	list: listTeachingCoursesRule,
	attendance: saveAttendanceRule,
	results: saveResultsRule,
	enrollmentWindow: setEnrollmentOpenRule,
} as const;

// ── Asistencia y completado (§6.8) ────────────────────────────────────────────

export const attendedSessionsOf = (participant: TeachingParticipant): number =>
	participant.attendance.filter((mark) => mark.attended).length;

/** Porcentaje entero para mostrar; la decisión usa `meetsAttendance`. */
export const attendancePercent = (attended: number, total: number): number =>
	total === 0 ? 0 : Math.floor((attended * 100) / total);

/**
 * Se compara en enteros para no depender del redondeo: 2 de 3 sesiones con
 * mínimo 67 % no cumple, y con mínimo 66 % sí.
 */
export const meetsAttendance = (
	attended: number,
	total: number,
	minAttendance: number,
): boolean => total > 0 && attended * 100 >= minAttendance * total;

/**
 * Qué cuenta como completado, según la regla del curso (docs/adr/0011, 0014).
 *
 * Cada regla es una conjunción de términos: asistencia si la cuenta, contenido
 * si lo cuenta, y aprobado si el curso exige evaluación. `ATTENDANCE` queda
 * así idéntica a la de siempre —`% asistencia ≥ mínimo Y (aprobado O sin
 * evaluación)`—, y con una sola sesión el mínimo es de hecho 100 %, sin caso
 * especial. El contenido se lee de `contentCompletedAt`, que no se borra.
 */
export const isCompleted = (
	course: Pick<
		TeachingCourse,
		"minAttendance" | "requiresEvaluation" | "completionRule"
	> & {
		sessionCount: number;
	},
	participant: TeachingParticipant,
): boolean => {
	const attendanceOk =
		!countsAttendance(course.completionRule) ||
		meetsAttendance(
			attendedSessionsOf(participant),
			course.sessionCount,
			course.minAttendance,
		);
	const contentOk =
		!countsContent(course.completionRule) ||
		participant.contentCompletedAt !== null;
	const evaluationOk =
		!course.requiresEvaluation || participant.result === "PASSED";

	return attendanceOk && contentOk && evaluationOk;
};

export const completedParticipantsOf = (
	course: TeachingCourse,
): TeachingParticipant[] =>
	course.participants.filter((participant) =>
		isCompleted(
			{ ...course, sessionCount: course.sessions.length },
			participant,
		),
	);

/**
 * Quién suma crédito de entre quienes completaron. Un externo no suma (§4), y
 * sin dependencia no hay para quién contar.
 */
export const creditCandidatesOf = (
	completed: readonly TeachingParticipant[],
): CreditCandidate[] =>
	completed.flatMap((participant) =>
		participant.isInternal && participant.currentDependencyId !== null
			? [
					{
						userId: participant.userId,
						dependencyId: participant.currentDependencyId,
					},
				]
			: [],
	);

// ── Ventanas ──────────────────────────────────────────────────────────────────

const lastSessionOf = (course: Pick<TeachingCourse, "sessions">) =>
	course.sessions.at(-1) ?? null;

/** Se pasa lista desde el inicio del día local de la sesión. */
export const sessionOpensAt = (session: Pick<TeachingSession, "startsAt">) =>
	startOfZonedDay(session.startsAt);

export const isSessionOpen = (
	session: Pick<TeachingSession, "startsAt">,
	now: Date,
): boolean => sessionOpensAt(session) <= now;

/** "A partir de la fecha de la última sesión" (§6.8), en la zona del instituto. */
export const finishOpensAt = (
	course: Pick<TeachingCourse, "sessions">,
): Date | null => {
	const last = lastSessionOf(course);
	return last ? startOfZonedDay(last.startsAt) : null;
};

/**
 * El ejercicio del crédito: año de la última sesión (§6.9). Un autogestivo no
 * tiene sesiones y cae en `fallback`, que es el momento en que la persona
 * completó (docs/adr/0014).
 */
export const fiscalYearOf = (
	course: Pick<TeachingCourse, "sessions">,
	fallback: Date,
): number => zonedYearOf(lastSessionOf(course)?.startsAt ?? fallback);

/**
 * Resultados que faltan capturar. Con examen en línea no cuentan: nadie los
 * captura, y quien no lo presentó queda «No presentó» al cierre (docs/adr/0015).
 */
export const pendingResultsOf = (course: TeachingCourse): number =>
	course.requiresEvaluation && !evaluatesByQuiz(course)
		? course.participants.filter(
				(participant) => participant.result === "PENDING",
			).length
		: 0;

export const finishBlockerOf = (
	course: TeachingCourse,
	now: Date,
): FinishBlocker | null => {
	if (course.status !== "PUBLISHED") return "NOT_PUBLISHED";
	if (!requiresSessions(course.format)) return "SELF_PACED";

	const opensAt = finishOpensAt(course);
	if (!opensAt) return "WITHOUT_SESSIONS";
	if (now < opensAt) return "TOO_EARLY";

	if (pendingResultsOf(course) > 0) return "PENDING_RESULTS";

	return null;
};

/**
 * Si una escritura recalcula el completado en el acto.
 *
 * Un finalizado, porque escribir en él es corregirlo. Un autogestivo publicado,
 * porque no tiene cierre: cada quien completa cuando cumple, y el último dato
 * que falte —el resultado o el contenido— es el que otorga el crédito.
 */
export const syncsOnWrite = (
	course: Pick<TeachingCourse, "status" | "format">,
): boolean =>
	course.status === "FINISHED" ||
	(course.status === "PUBLISHED" && !requiresSessions(course.format));

export const canToggleEnrollment = (
	course: Pick<TeachingCourse, "status" | "format">,
): boolean => course.status === "PUBLISHED" && !requiresSessions(course.format);

/** Abrir y cerrar a mano es la forma en que un autogestivo deja de recibir gente. */
export const assertEnrollmentTogglable = (
	course: Pick<TeachingCourse, "status" | "format">,
): void => {
	if (requiresSessions(course.format)) throw new TeachingNotSelfPacedError();
	if (course.status !== "PUBLISHED") throw new TeachingNotPublishedError();
};

export const assertFinishable = (course: TeachingCourse, now: Date): void => {
	switch (finishBlockerOf(course, now)) {
		case null:
			return;
		case "NOT_PUBLISHED":
			throw new TeachingNotPublishedError();
		case "SELF_PACED":
			throw new TeachingSelfPacedNotFinishableError();
		case "WITHOUT_SESSIONS":
			throw new TeachingWithoutSessionsError();
		case "TOO_EARLY":
			throw new TeachingFinishTooEarlyError(finishOpensAt(course) as Date);
		case "PENDING_RESULTS":
			throw new TeachingPendingResultsError(pendingResultsOf(course));
	}
};

/**
 * ¿Se puede escribir asistencia o resultados en este curso?
 *
 * Publicado: quien lo imparte. Finalizado: solo quien corrige. Cualquier otro
 * estado se ve igual que inexistente, como en la lectura.
 */
export const assertWritable = (
	course: Pick<TeachingCourse, "status" | "dependencyId">,
	scope: TeachingScope,
): void => {
	if (course.status === "PUBLISHED") return;
	if (course.status !== "FINISHED") throw new TeachingCourseNotFoundError();
	if (!canCorrect(scope, course.dependencyId)) {
		throw new TeachingCorrectionForbiddenError();
	}
};

export const canWrite = (
	course: Pick<TeachingCourse, "status" | "dependencyId">,
	scope: TeachingScope,
): boolean =>
	course.status === "PUBLISHED" ||
	(course.status === "FINISHED" && canCorrect(scope, course.dependencyId));

// ── Qué cambia en un envío ────────────────────────────────────────────────────

const participantsByDocument = (course: TeachingCourse) =>
	new Map(
		course.participants.map((participant) => [
			participant.userDocumentId,
			participant,
		]),
	);

/**
 * Las marcas del envío que cambian algo, ya resueltas a `userId`.
 *
 * Una marca igual a la guardada no se reescribe: `recordedBy` debe decir quién
 * hizo el último cambio, no quién pulsó guardar después. Si alguien del envío no
 * está inscrito se rechaza el envío entero.
 */
export const resolveAttendanceMarks = (
	course: TeachingCourse,
	sessionId: number,
	marks: SaveAttendanceDto["marks"],
): { userId: number; attended: boolean }[] => {
	const participants = participantsByDocument(course);

	return marks.flatMap((mark) => {
		const participant = participants.get(mark.userDocumentId);
		if (!participant) throw new TeachingUnknownParticipantError();

		const stored = participant.attendance.find(
			(row) => row.sessionId === sessionId,
		);
		return stored?.attended === mark.attended
			? []
			: [{ userId: participant.userId, attended: mark.attended }];
	});
};

/**
 * Los resultados que cambian algo. En un curso finalizado no se admite volver
 * a `PENDING`: el cierre ya exigió que no quedara ninguno.
 */
export const resolveResultEntries = (
	course: TeachingCourse,
	entries: SaveResultsDto["entries"],
): ResultWrite[] => {
	if (!course.requiresEvaluation) {
		throw new TeachingEvaluationNotRequiredError();
	}
	if (evaluatesByQuiz(course)) throw new TeachingResultsByQuizError();

	const participants = participantsByDocument(course);
	const resolved = entries.map((entry) => {
		const participant = participants.get(entry.userDocumentId);
		if (!participant) throw new TeachingUnknownParticipantError();
		return { participant, entry };
	});

	if (course.status === "FINISHED") {
		const pending = resolved.filter(({ entry }) => entry.result === "PENDING");
		if (pending.length > 0)
			throw new TeachingPendingResultsError(pending.length);
	}

	return resolved.flatMap(({ participant, entry }) =>
		participant.result === entry.result && participant.grade === entry.grade
			? []
			: [
					{
						userId: participant.userId,
						result: entry.result,
						grade: entry.grade,
					},
				],
	);
};
