import type { LessonType } from "../domain/content.rules";

// El vocabulario persistido está en inglés (reglas §24); la copia, aquí.

export const LESSON_TYPE_LABELS: Record<LessonType, string> = {
	TEXT: "Texto",
	FILE: "Archivo",
	VIDEO: "Video",
	LINK: "Enlace",
};

export const LESSON_TYPE_HINTS: Record<LessonType, string> = {
	TEXT: "Se escribe en la plataforma.",
	FILE: "Un documento que se lee o se descarga.",
	VIDEO: "Un video alojado aquí, que se reproduce en la lección.",
	LINK: "Un recurso que vive fuera.",
};
