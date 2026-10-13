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
 * Como `buildObjectKey`, pero con un identificador aleatorio en lugar de la
 * hora: la key de una subida firmada no se puede adivinar ni repetir.
 */
export const buildUploadObjectKey = (
	prefix: string,
	originalName: string,
): string => {
	const { base, ext } = splitName(originalName);
	return `${prefix}/${base}-${crypto.randomUUID()}${ext}`;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ¿Este segmento de una key es un `documentId`? Lo que no lo es no lo emitió
 * una subida, y buscarlo en una columna uuid haría fallar la consulta.
 */
export const isDocumentIdSegment = (segment: string | undefined): boolean =>
	segment !== undefined && UUID.test(segment);

/** Caracteres de control, incluido DEL. */
const isControlChar = (char: string): boolean => {
	const code = char.charCodeAt(0);
	return code < 0x20 || code === 0x7f;
};

/**
 * ¿Es la key tal como la emite una subida? Sin segmentos vacíos, sin `.` ni
 * `..`, sin barras invertidas y sin caracteres de control. El proxy decide lo
 * público por el prefijo: `media/../documentos/x` empieza por un prefijo
 * público y apunta a uno privado, y cada proveedor la resuelve a su manera.
 */
export const isCanonicalKey = (key: string): boolean =>
	key.length > 0 &&
	!key.includes("\\") &&
	![...key].some(isControlChar) &&
	key
		.split("/")
		.every((segment) => segment !== "" && segment !== "." && segment !== "..");
