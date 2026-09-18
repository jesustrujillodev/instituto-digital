/**
 * Valores por defecto del listado.
 *
 * Fuente ÚNICA: los usan el loader, el servicio (para la `pagination`) y el
 * repositorio (para el skip/take). Dos defaults distintos producen una
 * `pagination` que no describe la página consultada.
 */
export const COURSE_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;

/**
 * Asistencia mínima por defecto, en porcentaje.
 *
 * El 80 sale de §6.8 del alcance y se ajusta por curso. Vive aquí y no en el
 * `@default` de Prisma únicamente porque el formulario tiene que precargarlo:
 * la columna conserva su propio default para las escrituras que no lo manden.
 */
export const COURSE_DEFAULTS = {
	minAttendance: 80,
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
} as const;

/**
 * Tope de la tolerancia del QR, en minutos.
 *
 * Cuatro horas es lo más que una ventana puede estirarse sin dejar de probar
 * presencia; por encima, el QR deja de decir nada sobre quién estuvo.
 */
export const COURSE_QR_WINDOW_LIMITS = { min: 0, max: 240 } as const;

/**
 * Tope de sesiones por curso.
 *
 * §6.5 admite desde una sesión hasta varias semanas de sesiones. El límite no
 * es de negocio sino del formulario: por encima de esto el `useFieldArray`
 * deja de ser una forma razonable de capturarlas.
 */
export const COURSE_MAX_SESSIONS = 60;

/**
 * Configuración de la portada del curso.
 *
 * Cliente y servidor validan EXACTAMENTE lo mismo: el cliente para dar feedback
 * inmediato, el servidor porque es el único que manda. Dos listas separadas se
 * desincronizan y producen archivos aceptados en pantalla y rechazados al subir.
 *
 * `prefix` cuelga de `media/`, declarado público y de CDN en
 * shared/storage/storage.policy.ts: el catálogo lo pinta sin sesión y con caché.
 * La subcarpeta propia permite nombrarla en el gestor de nube sin apropiarse de
 * `media/`, que es de todo el proyecto.
 */
export const COURSE_COVER = {
	prefix: "media/portadas",
	allowedTypes: ["image/png", "image/jpeg", "image/webp"] as const,
	maxBytes: 5 * 1024 * 1024,
	/**
	 * Tope del archivo ORIGINAL, antes del reescalado del navegador.
	 *
	 * No es `maxBytes`: el cliente recorta y recodifica antes de subir, así que
	 * una foto de teléfono de 8 MB es exactamente el caso que la función existe
	 * para resolver y rechazarla de entrada la haría inútil. Este tope solo evita
	 * intentar decodificar un archivo absurdo en un canvas.
	 */
	maxSourceBytes: 25 * 1024 * 1024,
	/** Proporción a la que se recorta antes de subir; la misma que pinta la tarjeta. */
	aspectRatio: 16 / 9,
	/** Ancho máximo del archivo que se sube, en píxeles. */
	targetWidth: 1600,
} as const;

/** Texto de ayuda derivado de la configuración, para no repetir los límites. */
export const COURSE_COVER_HINT = `PNG, JPG o WEBP · máximo ${COURSE_COVER.maxBytes / (1024 * 1024)} MB · se recorta a 16:9`;
