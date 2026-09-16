import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { parseBrackets } from "@/shared/query/bracket-params";
import {
	applyQueryPatch,
	type PatchValue,
	type QueryPatch,
} from "@/shared/query/query.builder";
import { parseQuery } from "@/shared/query/query.parser";
import type {
	FilterOperator,
	PageSpec,
	ParsedQuery,
	SortSpec,
} from "@/shared/query/query.types";

// ===============================================================
// Filtros bracket en el cliente
// ===============================================================
// La contraparte de shared/query en React. Antes de esto cada pantalla se
// escribía su propio `updateParams` sobre `URLSearchParams` a pelo —está
// duplicado en inventario y en usuarios—, y con filtros anidados esa copia deja
// de ser viable: `filters[year][$gte]` no es una clave plana que se pueda
// borrar con `delete`.
//
// Los filtros viven en la URL y no en estado local a propósito: así la vista es
// enlazable, sobrevive a un refresh y el botón "atrás" hace lo que se espera.

const DEFAULT_DEBOUNCE_MS = 300;

export interface UseBracketFiltersOptions {
	readonly defaults: PageSpec;
	readonly maxPageSize?: number;
	/** Espera de `patchDebounced`, pensada para inputs de texto. */
	readonly debounceMs?: number;
}

export interface BracketFilters {
	/** El query string tal cual está ahora. */
	readonly params: URLSearchParams;
	/** El mismo query string ya interpretado, sin validar contra el dominio. */
	readonly query: ParsedQuery;
	/** Cuántos filtros hay puestos, para el contador del botón en móvil. */
	readonly activeCount: number;
	readonly patch: (changes: QueryPatch) => void;
	/** Igual que `patch`, pero espera a que dejen de teclear. */
	readonly patchDebounced: (changes: QueryPatch) => void;
	readonly setFilter: (
		field: string,
		operator: FilterOperator,
		value: PatchValue,
	) => void;
	readonly clearFilter: (field: string) => void;
	readonly clearAll: () => void;
	readonly setSort: (sort: readonly SortSpec[] | null) => void;
	readonly setPage: (page: number) => void;
	/** Valor crudo de un operador, para alimentar un input controlado. */
	readonly valueOf: (field: string, operator: FilterOperator) => string;
	/** Valor de un operador de lista, ya partido por comas. */
	readonly listOf: (field: string, operator: FilterOperator) => string[];
}

const readRaw = (
	params: URLSearchParams,
	field: string,
	operator: FilterOperator,
): string => {
	const tree = parseBrackets(params);
	const filters = tree.filters;
	if (filters === undefined || typeof filters === "string") return "";

	const branch = filters[field];
	if (branch === undefined || typeof branch === "string") return "";

	const value = branch[operator];
	return typeof value === "string" ? value : "";
};

export const useBracketFilters = ({
	defaults,
	maxPageSize,
	debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseBracketFiltersOptions): BracketFilters => {
	const [params, setParams] = useSearchParams();
	const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Un patch pendiente cuando el componente se va deja un setState sobre algo
	// desmontado y, peor, una navegación que nadie pidió.
	useEffect(
		() => () => {
			if (timeout.current) clearTimeout(timeout.current);
		},
		[],
	);

	const patch = useCallback(
		(changes: QueryPatch) => {
			// `preventScrollReset` porque el panel de filtros vive arriba: saltar al
			// inicio cada vez que se marca una casilla hace la lista inusable.
			setParams((previous) => applyQueryPatch(previous, changes), {
				preventScrollReset: true,
			});
		},
		[setParams],
	);

	const patchDebounced = useCallback(
		(changes: QueryPatch) => {
			if (timeout.current) clearTimeout(timeout.current);
			timeout.current = setTimeout(() => patch(changes), debounceMs);
		},
		[patch, debounceMs],
	);

	const query = useMemo(
		() => parseQuery(params, { defaults, maxPageSize }),
		[params, defaults, maxPageSize],
	);

	return {
		params,
		query,
		activeCount: query.filters.length,
		patch,
		patchDebounced,
		setFilter: useCallback(
			(field, operator, value) =>
				patch({ filters: { [field]: { [operator]: value } } }),
			[patch],
		),
		clearFilter: useCallback(
			(field) => patch({ filters: { [field]: null } }),
			[patch],
		),
		// Se reconstruye desde cero en vez de ir borrando clave por clave: así no
		// queda ningún filtro huérfano de una versión anterior de la pantalla.
		clearAll: useCallback(
			() => setParams(new URLSearchParams(), { preventScrollReset: true }),
			[setParams],
		),
		setSort: useCallback((sort) => patch({ sort }), [patch]),
		setPage: useCallback((page) => patch({ page }), [patch]),
		valueOf: useCallback(
			(field, operator) => readRaw(params, field, operator),
			[params],
		),
		listOf: useCallback(
			(field, operator) => {
				const raw = readRaw(params, field, operator);
				return raw === "" ? [] : raw.split(",");
			},
			[params],
		),
	};
};
