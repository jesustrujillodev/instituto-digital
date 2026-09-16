// Defensa CSRF en profundidad (complementa SameSite=Lax): el navegador SIEMPRE
// adjunta el header Origin en peticiones no-GET cross-site, y la página
// atacante no puede falsificarlo. Función pura — portable a cualquier
// framework (docs/auth/00-sistema-autenticacion.md §8).
//
// Política: si Origin está presente y su host NO coincide con el host de la
// petición → no confiable. Si está ausente (clientes no-navegador: curl,
// health checks) → se permite; esta capa protege contra navegadores, que sí
// lo envían.
export const isTrustedOrigin = (request: Request): boolean => {
	const origin = request.headers.get("Origin");
	if (!origin) return true;
	if (origin === "null") return false; // sandbox/data: — nunca confiable
	try {
		return new URL(origin).host === new URL(request.url).host;
	} catch {
		return false;
	}
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const isWriteMethod = (method: string): boolean =>
	!SAFE_METHODS.has(method.toUpperCase());
