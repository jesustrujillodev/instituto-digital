import * as v from "valibot";

// ===============================================================
// Contrato base de respuestas
// ===============================================================
// Estos esquemas son la ÚNICA fuente de verdad de la forma que devuelven los
// servicios de application/ y, aguas arriba, los loaders y actions. Los tipos de
// TypeScript se derivan de aquí (shared/response/response.types.ts), no se
// escriben a mano: así un cambio en el contrato rompe en compilación.
//
// La forma es agnóstica al framework a propósito. Hoy los servicios se llaman
// en proceso, pero el día que uno viva detrás de HTTP el mismo esquema sirve
// para validar la respuesta en la frontera sin tocar a los consumidores.

/**
 * Códigos transversales que no pertenecen a ningún dominio.
 *
 * Los códigos de negocio (USER_NOT_FOUND, INVALID_CREDENTIALS…) los declara cada
 * módulo en su `<modulo>.errors.ts`; aquí solo viven los que produce la propia
 * infraestructura de respuestas.
 */
export const RESPONSE_ERROR_CODES = {
	/** El input no pasó la validación de frontera (valibot). Trae fieldErrors. */
	VALIDATION: "VALIDATION_ERROR",
	NOT_FOUND: "NOT_FOUND",
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
	CONFLICT: "CONFLICT",
	/** Cualquier error NO tipado como DomainError. Nunca expone su mensaje real. */
	UNEXPECTED: "UNEXPECTED_ERROR",
} as const;

export type ResponseErrorCode =
	(typeof RESPONSE_ERROR_CODES)[keyof typeof RESPONSE_ERROR_CODES];

// ── Paginación ────────────────────────────────────────────────────────────────
// Los nombres coinciden con los del filtro de entrada (list.rules.ts: page,
// pageSize) y con los que consume DataTable. Un solo vocabulario de principio a
// fin: sin `limit` en el servidor y `pageSize` en la tabla.
export const paginationMetaSchema = v.object({
	page: v.number(),
	pageSize: v.number(),
	/** Total de registros que cumplen los filtros, SIN paginar. */
	total: v.number(),
	totalPages: v.number(),
});

// ── Error ─────────────────────────────────────────────────────────────────────
export const responseErrorSchema = v.object({
	/** Código estable de negocio o de RESPONSE_ERROR_CODES. Nunca un status HTTP. */
	code: v.string(),
	message: v.string(),
	/** `{ campo: mensaje }` para pintar el error junto a su input. */
	fieldErrors: v.optional(v.record(v.string(), v.string())),
	/** Metadatos serializables del error (p. ej. `retryAfterMs`). */
	details: v.optional(v.record(v.string(), v.unknown())),
});

// ── Envelope ──────────────────────────────────────────────────────────────────

/**
 * Rama de éxito. `pagination` solo aparece en listados; `message` es la copia
 * opcional que el consumidor puede anunciar (toast) sin inventarse el texto.
 */
export const createOkResponseSchema = <T extends v.GenericSchema>(
	dataSchema: T,
) =>
	v.object({
		success: v.literal(true),
		data: dataSchema,
		message: v.optional(v.string()),
		pagination: v.optional(paginationMetaSchema),
		timestamp: v.string(),
	});

export const failResponseSchema = v.object({
	success: v.literal(false),
	error: responseErrorSchema,
	timestamp: v.string(),
});

/**
 * Unión discriminada por `success`: TypeScript impide construir estados
 * imposibles (`{ success: true, error }`) y estrecha el tipo con un simple
 * `if (response.success)`.
 *
 * @example
 * const userResponseSchema = createResponseSchema(safeUserSchema);
 * const userListResponseSchema = createResponseSchema(v.array(safeUserSchema));
 */
export const createResponseSchema = <T extends v.GenericSchema>(
	dataSchema: T,
) =>
	v.variant("success", [
		createOkResponseSchema(dataSchema),
		failResponseSchema,
	]);
