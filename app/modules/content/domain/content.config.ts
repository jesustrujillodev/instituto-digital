import type { LessonBody } from "./content.types";

/** El temario se recorre en una sola pantalla: más módulos la vuelven inmanejable. */
export const CONTENT_MAX_MODULES_PER_COURSE = 30;

/** Pasado este punto lo que toca es partir el módulo en dos, no seguir añadiendo. */
export const CONTENT_MAX_LESSONS_PER_MODULE = 50;

export const CONTENT_TITLE_MAX_LENGTH = 120;

export const CONTENT_DESCRIPTION_MAX_LENGTH = 500;

/** Ocho horas: una lección más larga que una jornada es un módulo mal partido. */
export const LESSON_MAX_ESTIMATED_MINUTES = 480;

/**
 * Prefijo PRIVADO a propósito: no cuelga de `media/` ni de `profile-photos/`,
 * así que `isPublicKey` lo deja fuera y el proxy exige sesión (fail-closed).
 */
export const LESSON_MATERIAL_PREFIX = "documentos/lecciones";

/** Lo que se adjunta para leer o descargar. El tope es el de un manual, no el de un video. */
export const LESSON_FILE = {
	allowedTypes: [
		"application/pdf",
		"image/png",
		"image/jpeg",
		"image/webp",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	],
	maxBytes: 25 * 1024 * 1024,
} as const;

/**
 * Dos contenedores y nada más: sin transcodificar, lo que sube el capacitador es
 * lo que reproduce el navegador, y un `.mov` de teléfono no abre en Chrome.
 */
export const LESSON_VIDEO = {
	allowedTypes: ["video/mp4", "video/webm"],
	maxBytes: 2 * 1024 * 1024 * 1024,
} as const;

/** Margen para elegir el archivo y que empiece la subida, no para completarla. */
export const LESSON_UPLOAD_TTL_S = 15 * 60;

/** Una jornada de trabajo: la firma no puede morir a mitad de un video largo. */
export const LESSON_PLAYBACK_TTL_S = 6 * 60 * 60;

/** Una lección más larga que esto es un módulo mal partido, no un texto. */
export const LESSON_BODY_MAX_BYTES = 256 * 1024;

/** Más anidamiento que esto no lo produce el editor ni lo lee nadie. */
export const LESSON_BODY_MAX_DEPTH = 6;

/** A lo que cae una lectura que no reconoce el blob guardado. */
export const EMPTY_LESSON_BODY: LessonBody = { type: "doc", content: [] };

// ── Cuestionarios (docs/adr/0015) ─────────────────────────────────────────────

export const QUIZ_TITLE_MAX_LENGTH = 120;

/** Un examen más largo que esto es dos exámenes. */
export const QUIZ_MAX_QUESTIONS = 50;

export const QUIZ_STATEMENT_MAX_LENGTH = 500;

export const QUIZ_OPTION_MAX_LENGTH = 200;

export const QUIZ_OPTIONS_RANGE = { min: 2, max: 6 } as const;

export const QUIZ_POINTS_RANGE = { min: 1, max: 10 } as const;

export const QUIZ_DEFAULT_PASSING_SCORE = 70;

/** El texto de las dos opciones de verdadero o falso lo pone el servidor. */
export const TRUE_FALSE_LABELS = ["Verdadero", "Falso"] as const;
