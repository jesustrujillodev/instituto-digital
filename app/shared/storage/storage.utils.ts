/**
 * Extrae la key del objeto a partir de la referencia estable que se persiste en
 * la BD: el formato proxy `/api/storage?key=<encoded-key>`.
 *
 * También tolera que le pasen una key cruda (sin el prefijo del proxy), en cuyo
 * caso la devuelve tal cual. Devuelve `null` si no puede determinarla.
 *
 * Nota: a diferencia del template original, aquí NO se soporta el formato legado
 * de URL completa del proveedor (`https://bucket.s3.../key`) porque este proyecto
 * nace guardando siempre la referencia proxy — no hay datos legados que migrar.
 */
export function getKeyFromUrl(url: string): string | null {
	if (!url) return null;

	// Formato proxy: /api/storage?key=<encoded-key>
	if (url.startsWith("/api/storage")) {
		try {
			const parsed = new URL(url, "http://localhost");
			return parsed.searchParams.get("key") || null;
		} catch {
			return null;
		}
	}

	// No es una URL http(s) ni el formato proxy → asumimos que ya es una key cruda.
	if (!url.startsWith("http")) {
		return url;
	}

	return null;
}
