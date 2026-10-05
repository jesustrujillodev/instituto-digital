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
