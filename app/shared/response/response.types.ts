import type * as v from "valibot";
import type {
	paginationMetaSchema,
	responseErrorSchema,
} from "@/shared/rules/response.rules";

// Derivados de los esquemas (shared/rules/response.rules.ts), no copiados: si el
// contrato cambia allí, aquí falla la compilación.
export type PaginationMeta = v.InferOutput<typeof paginationMetaSchema>;
export type ResponseError = v.InferOutput<typeof responseErrorSchema>;

/**
 * Rama de éxito del envelope.
 *
 * `T` es el dato propio del dominio (SafeUser, SafeUser[], null…). El genérico
 * se escribe a mano —y no se infiere de `createOkResponseSchema`— porque valibot
 * no permite inferir un esquema genérico sin instanciarlo.
 */
export interface OkResponse<T> {
	readonly success: true;
	readonly data: T;
	/** Copia opcional del resultado, para anunciarlo sin duplicar el texto. */
	readonly message?: string;
	/** Solo en listados paginados. */
	readonly pagination?: PaginationMeta;
	readonly timestamp: string;
}

export interface FailResponse {
	readonly success: false;
	readonly error: ResponseError;
	readonly timestamp: string;
}

/**
 * Respuesta estándar de TODO servicio de application/, y de todo loader y action.
 *
 * @example
 * const result = await context.userService.findById(documentId);
 * if (!result.success) throw toRouteError(result.error, USER_ERROR_MESSAGES);
 * // aquí result es OkResponse<SafeUser>
 */
export type AppResponse<T> = OkResponse<T> | FailResponse;

/** Entrada mínima para calcular la metadata de paginación. */
export interface PaginationInput {
	page: number;
	pageSize: number;
	total: number;
}
