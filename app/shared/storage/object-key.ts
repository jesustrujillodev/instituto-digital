// Construcción de keys de objeto con convención única: prefijo lógico + nombre
// sanitizado + timestamp. Centraliza la sanitización para evitar colisiones y
// path-traversal (una key nunca debe contener `/` ni `..` provenientes del
// nombre original que sube el usuario).

/**
 * Sanitiza un nombre de archivo: reemplaza cualquier carácter que no sea
 * alfanumérico, punto o guion por `_`. Elimina así separadores de ruta y
 * secuencias de escape.
 */
export const sanitizeFileName = (name: string): string =>
	name.replace(/[^a-zA-Z0-9.-]/g, "_");

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
	const safe = sanitizeFileName(originalName);
	const dot = safe.lastIndexOf(".");
	const hasExt = dot > 0; // > 0 evita tratar ".gitignore" como solo extensión
	const base = hasExt ? safe.slice(0, dot) : safe;
	const ext = hasExt ? safe.slice(dot) : "";
	return `${prefix}/${base}-${Date.now()}${ext}`;
};
