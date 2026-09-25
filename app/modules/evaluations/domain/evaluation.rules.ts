import * as v from "valibot";
import {
	type CourseFormat,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import {
	EVALUATION_BATCH_LIMIT,
	EVALUATION_NOTE_MAX_LENGTH,
	EVALUATION_TITLE_MAX_LENGTH,
} from "./evaluation.config";
import {
	EvaluationSelfPacedError,
	EvaluationUnknownParticipantError,
} from "./evaluation.errors";
import type {
	EvaluationResultWrite,
	EvaluationTarget,
	SaveEvaluationResultsDto,
} from "./evaluation.types";

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

/** Solo un curso con sesiones tiene quién capture evaluaciones de seguimiento. */
export const assertFollowUpsAllowed = (format: CourseFormat): void => {
	if (!requiresSessions(format)) throw new EvaluationSelfPacedError();
};

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const findEvaluationCourseRule = v.object({ documentId });

const evaluationNote = v.pipe(
	v.optional(v.string("La observación debe ser texto."), ""),
	v.trim(),
	v.maxLength(
		EVALUATION_NOTE_MAX_LENGTH,
		`La observación no puede superar los ${EVALUATION_NOTE_MAX_LENGTH} caracteres.`,
	),
	v.transform((value): string | null => (value === "" ? null : value)),
);

const evaluationTitle = v.pipe(
	v.string("El nombre de la evaluación es obligatorio."),
	v.trim(),
	v.minLength(1, "El nombre de la evaluación es obligatorio."),
	v.maxLength(
		EVALUATION_TITLE_MAX_LENGTH,
		`El nombre no puede superar los ${EVALUATION_TITLE_MAX_LENGTH} caracteres.`,
	),
);

/** `null` en la sesion es deliberado: hay evaluaciones sin dia (§2). */
const sessionDocumentId = v.optional(v.nullable(documentId), null);

export const createEvaluationRule = v.object({
	title: evaluationTitle,
	sessionDocumentId,
});

export const updateEvaluationRule = v.object({
	evaluationDocumentId: documentId,
	title: evaluationTitle,
	sessionDocumentId,
});

export const removeEvaluationRule = v.object({
	evaluationDocumentId: documentId,
});

const captureEntry = v.object({
	userDocumentId: documentId,
	/** `null` es "sin veredicto": la observacion puede ir sola. */
	passed: v.nullable(v.boolean("Indica si la persona acreditó.")),
	note: evaluationNote,
});

export const saveEvaluationResultsRule = v.object({
	evaluationDocumentId: documentId,
	entries: v.pipe(
		v.array(captureEntry, "Revisa la captura de resultados."),
		v.minLength(1, "Captura al menos un resultado."),
		v.maxLength(
			EVALUATION_BATCH_LIMIT,
			`No puedes guardar más de ${EVALUATION_BATCH_LIMIT} resultados a la vez.`,
		),
	),
});

export const evaluationRules = {
	findCourse: findEvaluationCourseRule,
	create: createEvaluationRule,
	update: updateEvaluationRule,
	remove: removeEvaluationRule,
	results: saveEvaluationResultsRule,
} as const;

// ── Que cambia en un envio ────────────────────────────────────────────────────

/**
 * Lo que el envio cambia de verdad, resuelto a `userId`.
 *
 * Una captura identica a la guardada no se reescribe: `recordedBy` debe decir
 * quien hizo el ultimo cambio, no quien pulso guardar despues. Vaciar los dos
 * campos borra la fila, que es como se vuelve a "sin capturar". Si alguien del
 * envio ya no esta inscrito se rechaza el envio entero.
 */
export const resolveCaptureWrites = (
	target: Pick<EvaluationTarget, "participants" | "results">,
	entries: SaveEvaluationResultsDto["entries"],
): { writes: EvaluationResultWrite[]; deletes: number[] } => {
	const participants = new Map(
		target.participants.map((participant) => [
			participant.userDocumentId,
			participant.userId,
		]),
	);
	const stored = new Map(target.results.map((row) => [row.userId, row]));

	const writes: EvaluationResultWrite[] = [];
	const deletes: number[] = [];

	for (const entry of entries) {
		const userId = participants.get(entry.userDocumentId);
		if (userId === undefined) throw new EvaluationUnknownParticipantError();

		const current = stored.get(userId);

		if (entry.passed === null && entry.note === null) {
			if (current) deletes.push(userId);
			continue;
		}

		if (current?.passed === entry.passed && current?.note === entry.note) {
			continue;
		}

		writes.push({ userId, passed: entry.passed, note: entry.note });
	}

	return { writes, deletes };
};

/** Cuantas personas tienen ya un veredicto en esta evaluacion. */
export const recordedOf = (
	results: readonly { passed: boolean | null }[],
): number => results.filter((row) => row.passed !== null).length;
