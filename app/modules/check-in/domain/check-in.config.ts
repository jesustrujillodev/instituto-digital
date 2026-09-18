/**
 * 24 bytes en base64url son 32 caracteres y 192 bits de entropía: el token es
 * la única credencial que lleva el QR, así que no puede ser adivinable.
 */
export const QR_TOKEN_BYTES = 24;
export const QR_TOKEN_LENGTH = 32;
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

/** Minutos de tolerancia alrededor de cada sesión, si el curso no los ajusta. */
export const QR_WINDOW_DEFAULTS = {
	opensBeforeMinutes: 15,
	closesAfterMinutes: 15,
} as const;

export const QR_WINDOW_LIMITS = { min: 0, max: 240 } as const;

/** Por IP: el token es opaco, pero nadie necesita probar 20 veces por minuto. */
export const CHECK_IN_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

/** La ruta pública que codifica el QR, relativa al origen. */
export const checkInPathOf = (token: string): string => `/asistencia/${token}`;
