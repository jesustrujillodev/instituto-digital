/**
 * Trunca un texto a un número máximo de caracteres
 * @param text - El texto a truncar
 * @param maxLength - Longitud máxima (default: 50)
 * @param suffix - Sufijo a agregar cuando se trunca (default: '...')
 * @returns El texto truncado
 */
export function truncateText(
	text: string | null | undefined,
	maxLength = 50,
	suffix = "...",
): string {
	if (!text) return "";

	if (text.length <= maxLength) {
		return text;
	}

	return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Trunca texto por palabras completas en lugar de caracteres
 * @param text - El texto a truncar
 * @param maxWords - Número máximo de palabras
 * @param suffix - Sufijo a agregar cuando se trunca (default: '...')
 * @returns El texto truncado
 */
export function truncateWords(
	text: string | null | undefined,
	maxWords = 10,
	suffix = "...",
): string {
	if (!text) return "";

	const words = text.trim().split(/\s+/);

	if (words.length <= maxWords) {
		return text;
	}

	return words.slice(0, maxWords).join(" ") + suffix;
}

/**
 * Trunca texto de forma inteligente, respetando límites de palabras
 * @param text - El texto a truncar
 * @param maxLength - Longitud máxima aproximada
 * @param suffix - Sufijo a agregar cuando se trunca (default: '...')
 * @returns El texto truncado
 */
export function smartTruncate(
	text: string | null | undefined,
	maxLength = 100,
	suffix = "...",
): string {
	if (!text) return "";

	if (text.length <= maxLength) {
		return text;
	}

	// Buscar el último espacio antes del límite
	const truncated = text.slice(0, maxLength - suffix.length);
	const lastSpace = truncated.lastIndexOf(" ");

	if (lastSpace > 0) {
		return truncated.slice(0, lastSpace) + suffix;
	}

	return truncated + suffix;
}

/**
 * Elimina acentos y diacríticos de un texto y lo convierte a minúsculas
 * @param text - El texto a normalizar
 * @returns El texto normalizado
 */
export function normalizeString(text: string | null | undefined): string {
	if (!text) return "";

	return text
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

/**
 * Nombre visible → slug canónico, apto para una URL.
 *
 * Es LA regla que impide que "RH", "R.H." y "  recursos humanos " convivan
 * como tres cosas distintas: donde se declara unicidad sobre el slug y no
 * sobre el nombre, dos formas de escribir lo mismo colisionan en la base en
 * vez de duplicar la entrada.
 *
 * Vive en `lib/` y no en un módulo porque lo comparte cualquier módulo
 * que derive identificadores o URLs legibles de un nombre, y un slug generado
 * con dos reglas distintas dejaría de ser canónico.
 *
 * @param text - El texto a convertir
 * @returns El slug en minúsculas, sin acentos y separado por guiones
 */
export function toSlug(text: string | null | undefined): string {
	return normalizeString(text)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Forma exacta de lo que produce `toSlug` (más el sufijo numérico de colisión).
 *
 * Vive junto a `toSlug` porque quien recibe un slug de fuera —la URL del
 * comparador, o la carpeta de storage de un vehículo— tiene que comprobarlo con
 * la MISMA regla que lo generó.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `true` si el texto tiene forma de slug canónico. */
export const isSlug = (text: string): boolean => SLUG_PATTERN.test(text);
