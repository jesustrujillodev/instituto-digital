/**
 * Convierte un objeto plano en FormData para envíos multipart.
 *
 * Con archivos de por medio no hay alternativa: `multipart/form-data` es el
 * único transporte, y FormData solo admite strings y `File`.
 *
 * Reglas:
 * - `File`           → se adjunta tal cual
 * - `File[]`         → cada archivo con la MISMA clave (leer con `getAll`)
 * - array u objeto   → `JSON.stringify` en una sola entrada
 * - primitivos       → `String(value)`
 * - `null`/`undefined` → se OMITEN
 *
 * La última regla implica que el servidor no distingue "no enviado" de "borrar":
 * si un campo necesita borrarse, manda un centinela explícito y trátalo en el
 * parser.
 */
export function toFormData(obj: Record<string, unknown>): FormData {
	const formData = new FormData();

	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) continue;

		if (value instanceof File) {
			formData.append(key, value);
		} else if (Array.isArray(value)) {
			if (value.length > 0 && value[0] instanceof File) {
				for (const file of value) formData.append(key, file as File);
			} else {
				formData.append(key, JSON.stringify(value));
			}
		} else if (typeof value === "object") {
			formData.append(key, JSON.stringify(value));
		} else {
			formData.append(key, String(value));
		}
	}

	return formData;
}
