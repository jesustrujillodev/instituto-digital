import * as v from "valibot";
import {
	accessTokenPayloadSchema,
	listSessionsRule,
	lockdownRule,
	loginRule,
	revokeSessionRule,
	revokeUserSessionsRule,
	verifiedAccessTokenPayloadSchema,
} from "./auth.rules";

export const validateLogin = (data: unknown) => {
	return v.parse(loginRule, data);
};

export const validateAccessTokenPayload = (data: unknown) => {
	return v.parse(accessTokenPayloadSchema, data);
};

/**
 * Valida lo que devuelve `jwtVerify`. Lanza si falta `iat`, y eso es
 * deliberado: sin `iat` no hay nada que comparar contra el epoch, y un token
 * inevaluable se trata como inválido, no como válido.
 */
export const validateVerifiedAccessTokenPayload = (data: unknown) => {
	return v.parse(verifiedAccessTokenPayloadSchema, data);
};

// ── Monitor de sesiones (admin) ───────────────────────────────────────────────

export const validateListSessions = (data: unknown) => {
	return v.parse(listSessionsRule, data);
};

export const validateRevokeSession = (data: unknown) => {
	return v.parse(revokeSessionRule, data);
};

export const validateRevokeUserSessions = (data: unknown) => {
	return v.parse(revokeUserSessionsRule, data);
};

export const validateLockdown = (data: unknown) => {
	return v.parse(lockdownRule, data);
};
