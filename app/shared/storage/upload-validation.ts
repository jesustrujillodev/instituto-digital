// Validación reutilizable de archivos antes de subirlos. Centraliza el chequeo de
// tipo y tamaño que de otro modo cada consumidor repetiría inline.

// File-like estructural: lo satisface el File de FormData (name/type/size/arrayBuffer).
export type UploadInput = {
	name: string;
	type: string;
	size: number;
	arrayBuffer(): Promise<ArrayBuffer>;
};

/**
 * Lo que basta para decidir si un archivo se acepta.
 *
 * El contenido no hace falta, y por eso la subida firmada —donde el servidor
 * nunca ve los bytes— puede validar con la misma función que el navegador.
 */
export type UploadCandidate = Pick<UploadInput, "name" | "type" | "size">;

export interface UploadValidationOptions {
	/** Content-types permitidos (allowlist). Si se omite, no se restringe el tipo. */
	allowedTypes?: readonly string[];
	/** Tamaño máximo por archivo en bytes. Si se omite, no se restringe. */
	maxBytes?: number;
}

/**
 * Valida un archivo contra las opciones dadas.
 * @returns `null` si es válido, o un motivo legible del rechazo.
 */
export const validateUploadInput = (
	file: UploadCandidate,
	opts: UploadValidationOptions = {},
): string | null => {
	if (file.size === 0) return "archivo vacío";
	if (opts.allowedTypes && !opts.allowedTypes.includes(file.type)) {
		return `tipo no permitido: ${file.type || "desconocido"}`;
	}
	if (opts.maxBytes !== undefined && file.size > opts.maxBytes) {
		return `supera el máximo de ${opts.maxBytes} bytes`;
	}
	return null;
};
