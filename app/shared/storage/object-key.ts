// Construcción de keys de objeto con convención única: prefijo lógico + nombre
// sanitizado + timestamp (o huella del contenido). Centraliza la sanitización
// para evitar colisiones y path-traversal (una key nunca debe contener `/` ni
// `..` provenientes del nombre original que sube el usuario).

/**
 * Sanitiza un nombre de archivo: reemplaza cualquier carácter que no sea
 * alfanumérico, punto o guion por `_`. Elimina así separadores de ruta y
 * secuencias de escape.
 */
export const sanitizeFileName = (name: string): string =>
	name.replace(/[^a-zA-Z0-9.-]/g, "_");

const splitName = (originalName: string) => {
	const safe = sanitizeFileName(originalName);
	const dot = safe.lastIndexOf(".");
	const hasExt = dot > 0; // > 0 evita tratar ".gitignore" como solo extensión
	return hasExt
		? { base: safe.slice(0, dot), ext: safe.slice(dot) }
		: { base: safe, ext: "" };
};

/**
 * Construye la key final de un objeto:
 *   `${prefix}/${baseSanitizado}-${timestamp}${ext}`
 *
 * @param prefix     Carpeta lógica (p. ej. "profile-photos", "documents").
 * @param originalName Nombre original del archivo subido (se sanitiza).
 */
export const buildObjectKey = (
	prefix: string,
	originalName: string,
): string => {
	const { base, ext } = splitName(originalName);
	return `${prefix}/${base}-${Date.now()}${ext}`;
};

/**
 * Como `buildObjectKey`, pero con la huella del contenido en lugar de la hora:
 * los mismos bytes en la misma carpeta caen siempre en la misma key, así que
 * subir o copiar dos veces lo mismo no duplica el objeto.
 *
 * @param digest Huella hexadecimal de los bytes (la calcula quien sube).
 */
export const buildContentObjectKey = (
	prefix: string,
	originalName: string,
	digest: string,
): string => {
	const { base, ext } = splitName(originalName);
	return `${prefix}/${base}-${digest}${ext}`;
};
