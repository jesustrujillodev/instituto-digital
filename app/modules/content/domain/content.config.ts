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

/**
 * El material de las sesiones (docs/adr/0026). Prefijo privado aparte del de
 * las lecciones: cada uno tiene su fuente de referencias y su carpeta en la nube.
 */
export const SESSION_MATERIAL_PREFIX = "documentos/sesiones";

/** Más que esto en una sola sesión deja de ser apoyo y pasa a ser temario. */
export const SESSION_MATERIAL_MAX_PER_SESSION = 20;

/** Margen para elegir el archivo y que empiece la subida, no para completarla. */
export const LESSON_UPLOAD_TTL_S = 15 * 60;

/** Una jornada de trabajo: la firma no puede morir a mitad de un video largo. */
export const LESSON_PLAYBACK_TTL_S = 6 * 60 * 60;

/**
 * Se reutiliza hasta 2 h y siempre se entrega con 4 h por delante: nadie se
 * queda sin firma a mitad de un video largo.
 */
export const LESSON_PLAYBACK_URL_POLICY = {
	signTtlS: LESSON_PLAYBACK_TTL_S,
	minRemainingS: 4 * 60 * 60,
} as const;

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

/** Tope de intentos por persona; «sin límite» se guarda como nulo (docs/adr/0024). */
export const QUIZ_ATTEMPTS_RANGE = { min: 1, max: 10 } as const;

/**
 * Por persona y curso, sumando todos los cuestionarios. Cada envío bloquea la
 * fila del curso y los intentos pueden ser ilimitados: sin freno, una sola
 * persona haría esperar a todo el curso.
 */
export const QUIZ_SUBMIT_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

export const quizSubmitRateKeyOf = (
	userId: number,
	courseDocumentId: string,
): string => `quiz-submit:${userId}:${courseDocumentId}`;

// ── Evaluaciones de seguimiento (docs/adr/0027) ──────────────────────────────

export const FOLLOW_UPS_PER_COURSE_LIMIT = 20;

/** Minutos antes del inicio o después del fin de la sesión: hasta un día. */
export const FOLLOW_UP_MINUTES_RANGE = { min: 0, max: 24 * 60 } as const;

/** El texto de las dos opciones de verdadero o falso lo pone el servidor. */
export const TRUE_FALSE_LABELS = ["Verdadero", "Falso"] as const;
