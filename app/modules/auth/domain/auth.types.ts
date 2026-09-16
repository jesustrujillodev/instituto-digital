import type * as v from "valibot";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	accessTokenPayloadSchema,
	listSessionsRule,
	lockdownRule,
	loginRule,
	revokeSessionRule,
	revokeUserSessionsRule,
	sessionSchema,
	verifiedAccessTokenPayloadSchema,
} from "./auth.rules";

export type Session = v.InferOutput<typeof sessionSchema>;

export type AccessTokenPayload = v.InferOutput<typeof accessTokenPayloadSchema>;

/**
 * `AccessTokenPayload` + el `iat` que añade la firma. Es el tipo que circula
 * DESPUÉS de verificar: superconjunto del anterior, así que todo consumidor que
 * lea `sub`/`userId`/`email`/`role` sigue funcionando sin cambios.
 */
export type VerifiedAccessTokenPayload = v.InferOutput<
	typeof verifiedAccessTokenPayloadSchema
>;

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

// Resultado del refresh: refreshToken null ⇒ hit de gracia — se reemite solo
// el access token y la cookie de refresh del cliente se deja intacta.
export interface RefreshResult {
	accessToken: string;
	refreshToken: string | null;
}

export interface AuthContext {
	userId: number;
	documentId: string;
	email: string;
	role: AccessTokenPayload["role"];
	/** Alcance de la sesión: lo traduce `resolveScope` en shared/auth. */
	dependencyId: AccessTokenPayload["dependencyId"];
	isTrainer: AccessTokenPayload["isTrainer"];
}

export type LoginDto = v.InferInput<typeof loginRule>;

// ===============================================================
// Monitor de sesiones (admin)
// ===============================================================

export type ListSessionsDto = v.InferInput<typeof listSessionsRule>;
export type RevokeSessionDto = v.InferInput<typeof revokeSessionRule>;
export type RevokeUserSessionsDto = v.InferInput<typeof revokeUserSessionsRule>;

/**
 * Lo que ve una pantalla de administración de una sesión.
 *
 * Proyección deliberadamente distinta de `Session`: OMITE `refreshTokenHash` y
 * `prevTokenHash`. Son material secreto y no tienen por qué salir del servidor
 * — mismo criterio con el que `safeUserSchema` omite `password`.
 *
 * El dueño se resuelve por la relación en el caso de uso; la tabla `sessions`
 * sigue sin denormalizar nada (ver docs/auth §3).
 */
export interface SessionSummary {
	id: string;
	userId: number;
	ownerEmail: string;
	ownerFullName: string | null;
	userAgent: string | null;
	ipAddress: string | null;
	expiresAt: Date;
	createdAt: Date;
	isExpired: boolean;
	/** `true` si es la sesión desde la que se está viendo el panel. */
	isCurrent: boolean;
}

/** Página de sesiones; el total y las páginas viajan en `pagination`. */
export type SessionListResponse = AppResponse<SessionSummary[]>;

/** Revocaciones puntuales, sin dato de vuelta. */
export type SessionVoidResponse = AppResponse<null>;

/** Operaciones masivas: devuelven cuántas filas se eliminaron. */
export type RevokedCountResponse = AppResponse<{ revokedCount: number }>;

// ===============================================================
// Lockdown (admin)
// ===============================================================

export type LockdownDto = v.InferInput<typeof lockdownRule>;
