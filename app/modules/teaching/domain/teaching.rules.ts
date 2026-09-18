import * as v from "valibot";
import { startOfZonedDay, zonedYearOf } from "@/lib/date-utils";
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
	TeachingPendingResultsError,
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

const documentId = v.pipe(v.string(), v.uuid());

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const findTeachingCourseRule = v.object({ documentId });

export const listTeachingCoursesRule = createListRule({
	status: v.optional(v.picklist(TEACHABLE_STATUSES)),
	sortBy: v.optional(v.picklist(TEACHING_SORT_FIELDS)),
	sortDir: v.optional(v.picklist(SORT_DIRECTIONS)),
});

export const saveAttendanceRule = v.object({
	sessionDocumentId: documentId,
	marks: v.pipe(
		v.array(v.object({ userDocumentId: documentId, attended: v.boolean() })),
		v.minLength(1),
		v.maxLength(TEACHING_BATCH_LIMIT),
	),
});

export const GRADE_RANGE = { min: 0, max: 100 } as const;

const resultEntry = v.pipe(
	v.object({
		userDocumentId: documentId,
		result: v.picklist(ENROLLMENT_RESULTS),
		grade: v.optional(
			v.nullable(
				v.pipe(
					v.number(),
					v.integer(),
					v.minValue(GRADE_RANGE.min),
					v.maxValue(GRADE_RANGE.max),
				),
			),
			null,
		),
	}),
	v.check(
		(entry) => entry.result !== "PENDING" || entry.grade === null,
		"La nota solo acompaña a un resultado capturado",
	),
);

export const saveResultsRule = v.object({
	entries: v.pipe(
		v.array(resultEntry),
		v.minLength(1),
		v.maxLength(TEACHING_BATCH_LIMIT),
	),
});

export const teachingRules = {
	find: findTeachingCourseRule,
	list: listTeachingCoursesRule,
	attendance: saveAttendanceRule,
	results: saveResultsRule,
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
 * `completado = % asistencia ≥ mínimo Y (aprobado O sin evaluación)`.
 *
 * Con una sola sesión el mínimo es de hecho 100 %, sin caso especial.
 */
export const isCompleted = (
	course: Pick<TeachingCourse, "minAttendance" | "requiresEvaluation"> & {
		sessionCount: number;
	},
	participant: TeachingParticipant,
): boolean =>
	meetsAttendance(
		attendedSessionsOf(participant),
		course.sessionCount,
		course.minAttendance,
	) &&
	(!course.requiresEvaluation || participant.result === "PASSED");

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

/** El ejercicio del crédito: año de la última sesión (§6.9). */
export const fiscalYearOf = (
	course: Pick<TeachingCourse, "sessions">,
	fallback: Date,
): number => zonedYearOf(lastSessionOf(course)?.startsAt ?? fallback);

export const pendingResultsOf = (course: TeachingCourse): number =>
	course.requiresEvaluation
		? course.participants.filter(
				(participant) => participant.result === "PENDING",
			).length
		: 0;

export const finishBlockerOf = (
	course: TeachingCourse,
	now: Date,
): FinishBlocker | null => {
	if (course.status !== "PUBLISHED") return "NOT_PUBLISHED";

	const opensAt = finishOpensAt(course);
	if (!opensAt) return "WITHOUT_SESSIONS";
	if (now < opensAt) return "TOO_EARLY";
	if (pendingResultsOf(course) > 0) return "PENDING_RESULTS";

	return null;
};

export const assertFinishable = (course: TeachingCourse, now: Date): void => {
	switch (finishBlockerOf(course, now)) {
		case null:
			return;
		case "NOT_PUBLISHED":
			throw new TeachingNotPublishedError();
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
