import * as v from "valibot";

export const basePaginationSchema = {
	page: v.optional(v.pipe(v.number(), v.minValue(1))),
	pageSize: v.optional(v.pipe(v.number(), v.maxValue(100))),
	search: v.optional(v.string()),
};

/**
 * Sentido de ordenación, común a cualquier listado.
 *
 * Vive aquí y no en el dominio de un módulo porque no describe nada del
 * negocio: es parte del contrato de paginación que comparten todos los
 * listados. Lo que sí es de cada módulo es su allowlist de campos ordenables.
 */
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const createListRule = <T extends v.ObjectEntries>(domainFilters: T) =>
	v.object({
		...basePaginationSchema,
		...domainFilters,
	});
