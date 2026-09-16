/**
 * Configuración de la foto de perfil.
 *
 * Vive aquí —y no repartida entre el formulario y el servicio— porque cliente y
 * servidor deben validar EXACTAMENTE lo mismo: el cliente para dar feedback
 * inmediato, el servidor porque es el único que manda. Dos listas separadas se
 * desincronizan y producen archivos aceptados en pantalla y rechazados al subir.
 *
 * `prefix` corresponde a un prefijo declarado público en
 * shared/storage/storage.policy.ts: las fotos de perfil se sirven sin sesión.
 */
export const USER_PHOTO = {
	prefix: "profile-photos",
	allowedTypes: ["image/png", "image/jpeg", "image/webp"] as const,
	maxBytes: 5 * 1024 * 1024,
} as const;

/** Texto de ayuda derivado de la configuración, para no repetir los límites. */
export const USER_PHOTO_HINT = `PNG, JPG o WEBP · máximo ${USER_PHOTO.maxBytes / (1024 * 1024)} MB`;

/**
 * Valores por defecto del listado.
 *
 * Fuente ÚNICA: antes estaban duplicados en el loader (`DEFAULT_PAGE_SIZE`) y en
 * el repositorio (`?? 10` dentro de skip/take). Dos defaults distintos producen
 * una `pagination` que no describe la página que realmente se consultó.
 */
export const USER_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;
