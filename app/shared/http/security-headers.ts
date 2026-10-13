/**
 * Cabeceras de seguridad de toda respuesta de la app. Van en la app y no en el
 * proxy para que valgan igual en Railway, en el VPS y con o sin Cloudflare.
 *
 * - HSTS: el navegador la ignora por http, así que no estorba en desarrollo.
 * - `frame-ancestors 'self'`: los únicos iframes son de la propia app (vista
 *   previa del certificado, material). `X-Frame-Options` cubre a navegadores
 *   sin CSP nivel 2.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Content-Security-Policy": "frame-ancestors 'self'",
	"X-Frame-Options": "SAMEORIGIN",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
};

/**
 * Agrega las que la respuesta no trae. Una que la ruta ya fijó gana: el proxy
 * de storage sirve los SVG con su propia CSP (`sandbox`), más estricta.
 */
export const applySecurityHeaders = (headers: Headers): void => {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!headers.has(name)) headers.set(name, value);
	}
};
