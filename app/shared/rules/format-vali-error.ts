import type * as v from "valibot";

/**
 * Traduce las incidencias de un ValiError al mapa `{ campo: mensaje }` que la
 * capa de presentación necesita para pintar cada error junto a su input.
 *
 * Se queda con el PRIMER mensaje de cada campo: mostrar tres errores apilados
 * bajo un mismo control no ayuda a corregirlo.
 *
 * Las incidencias sin `path` (validaciones cruzadas mal formadas) se descartan
 * aquí a propósito — no pertenecen a ningún campo y el action debe tratarlas
 * como error general.
 *
 * No se llama a mano desde los actions: la usa `toResponseError`
 * (shared/response) al normalizar un ValiError, de modo que los `fieldErrors`
 * llegan ya puestos dentro del envelope.
 */
export function toFieldErrors(
	issues: readonly v.BaseIssue<unknown>[],
): Record<string, string> {
	const fieldErrors: Record<string, string> = {};

	for (const issue of issues) {
		const path = issue.path?.map((segment) => String(segment.key)).join(".");
		if (!path || fieldErrors[path]) continue;

		fieldErrors[path] = issue.message;
	}

	return fieldErrors;
}
