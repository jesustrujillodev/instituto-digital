import { formatZonedDate } from "@/lib/date-utils";
import type { LessonType } from "../domain/content.rules";

// El vocabulario persistido está en inglés (reglas §24); la copia, aquí.

export const LESSON_TYPE_LABELS: Record<LessonType, string> = {
	TEXT: "Texto",
	FILE: "Archivo",
	VIDEO: "Video",
	LINK: "Enlace",
	QUIZ: "Cuestionario",
};

export const LESSON_TYPE_HINTS: Record<LessonType, string> = {
	TEXT: "Se escribe en la plataforma.",
	FILE: "Un documento que se lee o se descarga.",
	VIDEO: "Un video alojado aquí, que se reproduce en la lección.",
	LINK: "Un recurso que vive fuera.",
	QUIZ: "Preguntas de práctica: enviarlas completa la lección.",
};

/** Por qué «Eliminar» está apagado en un curso publicado (docs/adr/0031). */
export const DELETE_LOCKED_REASON = "Ya publicada: solo se edita o se agrega";

/** Lo que el aula le dice a quien la recorre sobre qué cuenta y cuándo. */
export function classroomProgressNote({
	countsContent,
	readOnly,
	contentCompletedAt,
	completed,
	withModuleQuizzes,
	withFinalQuiz,
	withLessons,
}: {
	countsContent: boolean;
	readOnly: boolean;
	contentCompletedAt: Date | string | null;
	completed: boolean;
	withModuleQuizzes: boolean;
	withFinalQuiz: boolean;
	withLessons: boolean;
}): string {
	if (completed) return "Acreditaste la capacitación.";
	if (!countsContent) {
		if (withFinalQuiz && !withLessons) {
			return "El examen final cuenta para acreditar la capacitación.";
		}
		return withFinalQuiz
			? "Las lecciones son material de apoyo; el examen final sí cuenta para acreditar la capacitación."
			: "Material de apoyo: recorrerlo no cuenta para acreditar la capacitación.";
	}
	if (contentCompletedAt) {
		return `Terminaste el contenido el ${formatZonedDate(new Date(contentCompletedAt))}.`;
	}
	if (readOnly) return "La capacitación terminó: puedes repasar sus lecciones.";

	return withModuleQuizzes
		? "Completa las lecciones obligatorias y aprueba la evaluación de cada módulo para terminar la capacitación."
		: "Completa las lecciones obligatorias para terminar la capacitación.";
}
