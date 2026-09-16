import * as v from "valibot";

// La IP del cliente llega en headers que CUALQUIER cliente puede falsificar si
// no hay un proxy de confianza delante que los sobrescriba. Por eso:
//  1. Se valida el formato (IPv4/IPv6) — nunca se persiste un valor arbitrario.
//  2. El dato es SOLO informativo (auditoría / monitor de sesiones); ninguna
//     decisión de seguridad depende de él (docs/auth/01, L2).
const ipSchema = v.pipe(v.string(), v.trim(), v.ip());

const parseIp = (value: string | null): string | undefined => {
	if (!value) return undefined;
	const result = v.safeParse(ipSchema, value);
	return result.success ? result.output : undefined;
};

// Función pura — portable a cualquier framework que exponga Request estándar.
export const getClientIp = (request: Request): string | undefined => {
	// X-Forwarded-For es una lista "client, proxy1, proxy2" — el cliente es el primero.
	const forwardedFor = request.headers
		.get("X-Forwarded-For")
		?.split(",")[0]
		?.trim();

	return (
		parseIp(forwardedFor ?? null) ??
		parseIp(request.headers.get("CF-Connecting-IP"))
	);
};
