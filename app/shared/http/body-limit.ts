import { isWriteMethod } from "./origin";

/** Lo que manda un formulario sin archivos: login y preferencia de tema. */
export const ANONYMOUS_BODY_MAX_BYTES = 64 * 1024;

/** El fondo raster del certificado (15 MB) es la subida más grande que pasa por el servidor. */
export const AUTHENTICATED_BODY_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Decide por la cabecera, antes de que una action llame a `request.formData()`,
 * que lee el cuerpo entero a memoria. Node no entrega más bytes de los que
 * declara `Content-Length`, así que la cabecera acota lo que se llegará a leer.
 */
export const bodyLimitStatusOf = (
	request: Request,
	authenticated: boolean,
): 411 | 413 | null => {
	if (!isWriteMethod(request.method)) return null;

	const declared = request.headers.get("Content-Length");
	if (declared === null) {
		return request.headers.has("Transfer-Encoding") ? 411 : null;
	}

	const bytes = Number(declared);
	if (!Number.isSafeInteger(bytes) || bytes < 0) return 411;

	const max = authenticated
		? AUTHENTICATED_BODY_MAX_BYTES
		: ANONYMOUS_BODY_MAX_BYTES;
	return bytes > max ? 413 : null;
};
