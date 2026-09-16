import * as v from "valibot";
import { atoms, type Role } from "@/shared/rules/atoms.rules";
import { createListRule, SORT_DIRECTIONS } from "@/shared/rules/list.rules";
import { LOCKDOWN_SCOPES } from "./security-state.repository";

// ── Entity schemas ─────────────────────────────────────────────────────────────

// Mirrors the Prisma Session model
export const sessionSchema = v.object({
	id: v.string(),
	userId: v.number(), // el usuario se resuelve por relación (sin denormalizar)
	refreshTokenHash: v.string(), // SHA-256 del token vigente — nunca el token crudo
	prevTokenHash: v.nullable(v.string()), // hash del token anterior (ventana de gracia)
	rotatedAt: v.nullable(v.date()), // momento de la última rotación
	userAgent: v.nullable(v.string()),
	ipAddress: v.nullable(v.string()),
	expiresAt: v.date(),
	createdAt: v.date(),
	updatedAt: v.date(),
});

// Payload stored inside the JWT access token
// Intentionally minimal — no sensitive data
//
// Es el payload que se FIRMA: `iat` no aparece porque en ese momento aún no
// existe — lo pone jose (`.setIssuedAt()`), no el llamador.
export const accessTokenPayloadSchema = v.object({
	sub: v.string(), // documentId
	userId: v.number(),
	email: v.string(),
	role: atoms.role, // picklist compartido — un rol arbitrario no pasa la validación
	/**
	 * Dependencia a la que pertenece. null = no adscrito (el superadministrador,
	 * cuyo alcance es global, y los externos).
	 *
	 * Va en el token y no se lee por petición porque `role` ya es un claim con el
	 * mismo perfil de obsolescencia y la maquinaria de invalidación ya está
	 * construida: `revokeUserTokens` sube el epoch, `evaluateToken` lo compara en
	 * cada petición y el refresh relee al usuario en cada rotación, así que el
	 * claim se autocura. Resolverlo por petición costaría un SELECT a auth.users
	 * en cada petición autenticada, que es justo lo que el diseño de
	 * docs/auth/02-revocacion-inmediata-epoch.md se tomó el trabajo de evitar.
	 *
	 * Es el id interno, como `userId`: no viaja al cliente en `SessionUser`.
	 */
	dependencyId: v.nullable(v.number()),
	/** Perfil de capacitador activo. Se revoca el token al activarlo o desactivarlo. */
	isTrainer: v.boolean(),
});

/**
 * Payload que sale de VERIFICAR un token.
 *
 * `iat` es obligatorio: es lo que se compara contra el epoch de validez, y un
 * token sin él no se puede evaluar — se rechaza entero en vez de dejarlo pasar
 * sin comprobar. Es un esquema aparte y no un campo opcional del anterior
 * justamente para que el tipo del verificador garantice que el dato está.
 */
export const verifiedAccessTokenPayloadSchema = v.object({
	...accessTokenPayloadSchema.entries,
	iat: v.pipe(v.number(), v.integer()), // segundos desde el epoch UNIX
});

export const loginRule = v.object({
	email: atoms.email,
	password: atoms.password,
});

// ── Monitor de sesiones (admin) ───────────────────────────────────────────────

/** Id interno del usuario dueño de la sesión (Session.userId es un entero). */
const userId = v.pipe(v.number(), v.integer(), v.minValue(1));

/** Id público de la sesión. Nunca un hash: eso es secreto y no sale del server. */
const sessionId = v.pipe(v.string(), v.uuid());

/**
 * Columnas por las que se puede ordenar el listado.
 *
 * Es una allowlist, no una sugerencia: el valor llega del query string y acaba
 * en un `orderBy`, así que solo pueden pasar nombres de columna conocidos.
 */
export const SESSION_SORT_FIELDS = ["createdAt", "expiresAt"] as const;
export type SessionSortField = (typeof SESSION_SORT_FIELDS)[number];

/** Estados por los que se puede filtrar. Sin valor ⇒ "active". */
export const SESSION_STATUSES = ["active", "expired", "all"] as const;
export type SessionStatusFilter = (typeof SESSION_STATUSES)[number];

/**
 * Quién puede operar el monitor de sesiones.
 *
 * Se declara una vez y la consumen el loader y el action de la ruta: el guard
 * está duplicado por necesidad —un loader protegido no protege las mutaciones de
 * su ruta— y con dos listas escritas a mano acabarían divergiendo.
 *
 * Incluye al superadministrador porque el monitor es también donde se levanta un
 * lockdown, y dejarlo fuera dejaría la plataforma sin nadie que pueda reabrirla.
 */
export const SESSION_MONITOR_ROLES: readonly Role[] = ["ADMIN", "SUPERADMIN"];

export const listSessionsRule = createListRule({
	userId: v.optional(userId),
	status: v.optional(v.picklist(SESSION_STATUSES)),
	sortBy: v.optional(v.picklist(SESSION_SORT_FIELDS)),
	sortDir: v.optional(v.picklist(SORT_DIRECTIONS)),
});

export const revokeSessionRule = v.object({ sessionId });

export const revokeUserSessionsRule = v.object({ userId });

// ── Lockdown (admin) ──────────────────────────────────────────────────────────

/** Palabra que hay que escribir para activar el lockdown; la pide también la UI. */
export const LOCKDOWN_CONFIRMATION_WORD = "CERRAR";

/**
 * Confirmación reforzada: se escribe la palabra, no un simple "Confirmar". Es
 * la acción más destructiva del sistema y la única que lo exige.
 */
export const lockdownRule = v.object({
	scope: v.picklist(LOCKDOWN_SCOPES),
	reason: v.optional(v.pipe(v.string(), v.maxLength(500))),
	confirmation: v.literal(LOCKDOWN_CONFIRMATION_WORD),
});

// ── Rule map ──────────────────────────────────────────────────────────────────

export const authRules = {
	login: loginRule,
	accessTokenPayload: accessTokenPayloadSchema,
	verifiedAccessTokenPayload: verifiedAccessTokenPayloadSchema,
	listSessions: listSessionsRule,
	revokeSession: revokeSessionRule,
	revokeUserSessions: revokeUserSessionsRule,
	lockdown: lockdownRule,
} as const;
