/**
 * Allowlist CERRADA de destinos tras autenticar.
 *
 * No es "cualquier ruta interna": un `redirectTo` abierto es un open redirect y
 * un vector de phishing. Hoy solo los escaneos de QR (asistencia e inscripción)
 * necesitan volver a donde estaban, y por eso solo sus formas están aquí. El
 * resto de la app sigue aterrizando en `/dashboard`, como decidió
 * docs/routing/00-sistema-enrutado.md.
 *
 * Cada patrón ancla los dos extremos y su clase de caracteres excluye `/`, `\`,
 * `:`, `?`, `#` y `@`, así que `//evil.com`, `https://evil.com`,
 * `/asistencia/x/../..` y `/asistencia/<token>?next=…` fallan todos.
 *
 * Duplica a propósito la forma de `checkInPathOf` y `enrollmentQrPathOf`:
 * `shared/` no puede depender de un módulo. El test importa las tres y fija el
 * contrato.
 */
const RETURN_TO_PATTERNS: readonly RegExp[] = [
	/^\/asistencia\/[A-Za-z0-9_-]{32}$/,
	/^\/inscripcion\/[A-Za-z0-9_-]{32}$/,
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
