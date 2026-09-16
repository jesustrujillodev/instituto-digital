import { SORT_DIRECTIONS, type SortDirection } from "@/shared/rules/list.rules";
import {
	type BracketNode,
	type BracketValue,
	parseBrackets,
	sortBracketKeys,
	toValueList,
} from "./bracket-params";
import {
	FILTER_OPERATORS,
	type FilterNode,
	type FilterOperator,
	LOGICAL_OPERATORS,
	type LogicalOperator,
	MULTI_VALUE_OPERATORS,
	type PageSpec,
	type ParsedQuery,
	type SortSpec,
} from "./query.types";

// ===============================================================
// Query string → ParsedQuery
// ===============================================================
// Segunda mitad del parseo: bracket-params.ts resuelve la FORMA y este archivo
// el SIGNIFICADO de las tres claves del contrato — `filters`, `pagination` y
// `sort`. Todavía no valida nada contra el dominio: eso es query.rules.ts.

/** Tope de hojas por consulta. Descarta el sobrante sin fallar. */
const MAX_FILTER_LEAVES = 60;

/** Tope de valores por hoja, para acotar un `$in` con una lista interminable. */
const MAX_VALUES_PER_LEAF = 50;

/**
 * Techo de `pageSize` cuando quien llama no impone uno.
 *
 * Es el mismo 100 que ya declara `basePaginationSchema` en shared/rules: el
 * contrato de paginación de la plataforma es uno solo, y este parser no puede
 * abrir una puerta que aquel cierra.
 */
const DEFAULT_MAX_PAGE_SIZE = 100;

const FILTER_OPERATOR_SET = new Set<string>(FILTER_OPERATORS);
const LOGICAL_OPERATOR_SET = new Set<string>(LOGICAL_OPERATORS);
const MULTI_VALUE_SET = new Set<string>(MULTI_VALUE_OPERATORS);

export interface QueryParseOptions {
	readonly defaults: PageSpec;
	/** Tope duro de `pageSize`, para que la URL no pueda pedir la tabla entera. */
	readonly maxPageSize?: number;
}

// ── Filtros ───────────────────────────────────────────────────────────────────

/**
 * Valores de una hoja.
 *
 * La coma solo separa en los operadores de lista: en `$contains` es texto que
 * alguien tecleó y partirla convertiría "Ruiz, Ana" en dos búsquedas. La
 * forma indexada (`[$in][0]=a&[$in][1]=b`) nunca se parte, y es la salida
 * cuando el valor sí lleva comas.
 */
const toOperatorValues = (
	operator: FilterOperator,
	value: BracketValue,
): string[] => {
	if (typeof value !== "string") {
		return toValueList(value).slice(0, MAX_VALUES_PER_LEAF);
	}

	if (!MULTI_VALUE_SET.has(operator)) return [value];

	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item !== "")
		.slice(0, MAX_VALUES_PER_LEAF);
};

interface WalkBudget {
	remaining: number;
}

/**
 * Recorre el subárbol de `filters` y produce las hojas y grupos.
 *
 * La regla que desambigua todo: una clave que empieza por `$` es un operador,
 * cualquier otra es un tramo de la ruta del campo. Por eso `filters[brand][slug][$eq]`
 * se lee como el campo `brand.slug` y `filters[$or][0][…]` como un grupo, sin
 * necesidad de saber de antemano qué campos existen.
 */
const walkFilters = (
	node: BracketNode,
	path: readonly string[],
	budget: WalkBudget,
): FilterNode[] => {
	const nodes: FilterNode[] = [];

	for (const key of sortBracketKeys(Object.keys(node))) {
		if (budget.remaining <= 0) break;

		const value = node[key];

		if (LOGICAL_OPERATOR_SET.has(key)) {
			if (typeof value === "string") continue;

			const children = sortBracketKeys(Object.keys(value)).flatMap((index) => {
				const child = value[index];
				return typeof child === "string"
					? []
					: walkFilters(child, path, budget);
			});

			if (children.length > 0) {
				nodes.push({ operator: key as LogicalOperator, children });
			}
			continue;
		}

		if (FILTER_OPERATOR_SET.has(key)) {
			// Un operador sin campo delante (`filters[$eq]=x`) no significa nada.
			if (path.length === 0) continue;

			const values = toOperatorValues(key as FilterOperator, value);
			if (values.length === 0) continue;

			budget.remaining -= 1;
			nodes.push({
				field: path.join("."),
				operator: key as FilterOperator,
				values,
			});
			continue;
		}

		// Atajo: `filters[campo]=valor` equivale a `filters[campo][$eq]=valor`.
		// Es un superconjunto de la gramática de Strapi y la allowlist de campos
		// lo sigue filtrando igual, así que no abre nada nuevo.
		if (typeof value === "string") {
			budget.remaining -= 1;
			nodes.push({
				field: [...path, key].join("."),
				operator: "$eq",
				values: [value],
			});
			continue;
		}

		nodes.push(...walkFilters(value, [...path, key], budget));
	}

	return nodes;
};

// ── Paginación y orden ────────────────────────────────────────────────────────

const toPositiveInt = (raw: string | undefined): number | undefined => {
	if (raw === undefined) return undefined;

	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const toPagination = (
	node: BracketValue | undefined,
	{ defaults, maxPageSize }: QueryParseOptions,
): PageSpec => {
	const source = node === undefined || typeof node === "string" ? {} : node;
	const rawPage = source.page;
	const rawPageSize = source.pageSize;

	const page =
		toPositiveInt(typeof rawPage === "string" ? rawPage : undefined) ??
		defaults.page;
	const pageSize =
		toPositiveInt(typeof rawPageSize === "string" ? rawPageSize : undefined) ??
		defaults.pageSize;

	return {
		page,
		pageSize: Math.min(pageSize, maxPageSize ?? DEFAULT_MAX_PAGE_SIZE),
	};
};

/** `campo:asc`. Sin sentido explícito se asume ascendente, como Strapi. */
const toSortSpec = (raw: string): SortSpec | null => {
	const [field, direction = "asc"] = raw.split(":");
	if (!field) return null;

	return SORT_DIRECTIONS.includes(direction as SortDirection)
		? { field, direction: direction as SortDirection }
		: null;
};

const toSort = (node: BracketValue | undefined): SortSpec[] =>
	toValueList(node)
		.map(toSortSpec)
		.filter((spec): spec is SortSpec => spec !== null);

// ── Entrada pública ───────────────────────────────────────────────────────────

/**
 * Parsea el query string completo.
 *
 * Nunca lanza: lo que no encaja se descarta. Un enlace que alguien cortó a la
 * mitad al pegarlo tiene que devolver la vista sin filtros, no un 500.
 */
export const parseQuery = (
	params: URLSearchParams,
	options: QueryParseOptions,
): ParsedQuery => {
	const tree = parseBrackets(params);
	const filtersNode = tree.filters;

	const filters =
		filtersNode === undefined || typeof filtersNode === "string"
			? []
			: walkFilters(filtersNode, [], { remaining: MAX_FILTER_LEAVES });

	return {
		filters,
		pagination: toPagination(tree.pagination, options),
		sort: toSort(tree.sort),
	};
};
