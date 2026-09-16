// Mapa extensión → content-type para servir archivos en modo inline por el proxy.
// Ampliado respecto al template (que solo cubría pdf/png/jpg): se suben fotos
// en webp/avif y documentos variados.

const MIME_BY_EXT: Record<string, string> = {
	// Imágenes
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".avif": "image/avif",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	// Documentos
	".pdf": "application/pdf",
	".doc": "application/msword",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".csv": "text/csv",
	".txt": "text/plain",
	".json": "application/json",
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** Devuelve el content-type inferido por la extensión de la key. */
export const contentTypeForKey = (key: string): string => {
	const lower = key.toLowerCase();
	const dot = lower.lastIndexOf(".");
	if (dot < 0) return DEFAULT_CONTENT_TYPE;
	return MIME_BY_EXT[lower.slice(dot)] ?? DEFAULT_CONTENT_TYPE;
};
