/**
 * Allowlist CERRADA de destinos tras autenticar.
 *
 * No es "cualquier ruta interna": un `redirectTo` abierto es un open redirect y
 * un vector de phishing. Hoy solo el escaneo de QR necesita volver a donde
 * estaba, y por eso solo su forma está aquí. El resto de la app sigue aterrizando
 * en `/dashboard`, como decidió docs/routing/00-sistema-enrutado.md.
 *
 * El patrón ancla los dos extremos y su clase de caracteres excluye `/`, `\`,
 * `:`, `?`, `#` y `@`, así que `//evil.com`, `https://evil.com`,
 * `/asistencia/x/../..` y `/asistencia/<token>?next=…` fallan todos.
 *
 * Duplica a propósito la forma de `checkInPathOf` (check-in/domain): `shared/`
 * no puede depender de un módulo. El test importa las dos y fija el contrato.
 */
const RETURN_TO_PATTERNS: readonly RegExp[] = [
	/^\/asistencia\/[A-Za-z0-9_-]{32}$/,
];

export const isSafeReturnTo = (value: unknown): value is string =>
	typeof value === "string" &&
	RETURN_TO_PATTERNS.some((pattern) => pattern.test(value));

/**
 * El destino si casa con la allowlist, si no el de reserva. Nunca lanza.
 *
 * Acepta `unknown` porque lo alimentan un `FormDataEntryValue | null` —que puede
 * ser un `File`— y un `searchParams.get()`, sin que quien llama estreche nada.
 */
export const safeReturnTo = (value: unknown, fallback: string): string =>
	isSafeReturnTo(value) ? value : fallback;
