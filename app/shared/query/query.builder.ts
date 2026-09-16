import {
	type BracketNode,
	parseBrackets,
	stringifyBrackets,
} from "./bracket-params";
import {
	type FilterOperator,
	MULTI_VALUE_OPERATORS,
	type PageSpec,
	type SortSpec,
} from "./query.types";

// ===============================================================
// Construcción del query string (lado cliente)
// ===============================================================
// El inverso del parser, y la razón de que exista: hoy cada pantalla del repo
// se escribe su propio `updateParams` con un `URLSearchParams` a pelo, y con
// filtros anidados eso deja de ser viable. Aquí se parsea lo que ya hay, se
// aplica un parche y se vuelve a serializar — así la URL que produce el cliente
// y la que entiende el servidor son la misma gramática por construcción.

const MULTI_VALUE_SET = new Set<string>(MULTI_VALUE_OPERATORS);

export type PatchValue = string | number | readonly (string | number)[] | null;

/** `null` en cualquier nivel significa "quita esto". */
export interface QueryPatch {
	readonly filters?: Readonly<
		Record<string, Readonly<Partial<Record<FilterOperator, PatchValue>>> | null>
	>;
	readonly page?: number | null;
	readonly pageSize?: number | null;
	readonly sort?: readonly SortSpec[] | null;
}

/**
 * Serializa el valor de un operador.
 *
 * Los de lista van en CSV en vez de indexados (`[$in]=a,b` y no `[$in][0]=a`):
 * la URL queda legible y compartible, que es lo que un catálogo público necesita.
 */
const toParamValue = (
	operator: FilterOperator,
	value: Exclude<PatchValue, null>,
): string | null => {
	if (Array.isArray(value)) {
		if (!MULTI_VALUE_SET.has(operator) || value.length === 0) return null;
		return value.join(",");
	}

	return String(value);
};

const applyFilters = (
	tree: BracketNode,
	patch: QueryPatch["filters"],
): void => {
	if (!patch) return;

	const current = tree.filters;
	const filters: BracketNode =
		current === undefined || typeof current === "string" ? {} : current;
	tree.filters = filters;

	for (const [field, operators] of Object.entries(patch)) {
		if (operators === null) {
			delete filters[field];
			continue;
		}

		const existing = filters[field];
		const branch: BracketNode =
			existing === undefined || typeof existing === "string" ? {} : existing;
		filters[field] = branch;

		for (const [operator, value] of Object.entries(operators)) {
			if (value === null || value === undefined) {
				delete branch[operator];
				continue;
			}

			const serialized = toParamValue(operator as FilterOperator, value);
			if (serialized === null) delete branch[operator];
			else branch[operator] = serialized;
		}

		if (Object.keys(branch).length === 0) delete filters[field];
	}
};

const applyPagination = (tree: BracketNode, patch: QueryPatch): void => {
	const current = tree.pagination;
	const pagination: BracketNode =
		current === undefined || typeof current === "string" ? {} : current;
	tree.pagination = pagination;

	// Cambiar un filtro y quedarse en la página 7 es la forma más rápida de
	// enseñar un listado vacío sobre un resultado que sí tiene elementos.
	const resetsPage = patch.filters !== undefined && patch.page === undefined;

	if (patch.page === null || resetsPage) delete pagination.page;
	else if (patch.page !== undefined) pagination.page = String(patch.page);

	if (patch.pageSize === null) delete pagination.pageSize;
	else if (patch.pageSize !== undefined) {
		pagination.pageSize = String(patch.pageSize);
	}
};

const applySort = (tree: BracketNode, patch: QueryPatch["sort"]): void => {
	if (patch === undefined) return;

	if (patch === null || patch.length === 0) {
		delete tree.sort;
		return;
	}

	tree.sort = Object.fromEntries(
		patch.map((spec, index) => [
			String(index),
			`${spec.field}:${spec.direction}`,
		]),
	);
};

/**
 * Aplica un parche sobre el query string actual.
 *
 * Devuelve `URLSearchParams` nuevos: nada muta los del llamador, que en React
 * suelen ser el estado de la ruta.
 */
export const applyQueryPatch = (
	current: URLSearchParams,
	patch: QueryPatch,
): URLSearchParams => {
	const tree = parseBrackets(current);

	applyFilters(tree, patch.filters);
	applyPagination(tree, patch);
	applySort(tree, patch.sort);

	return stringifyBrackets(tree);
};

export interface CanonicalOptions {
	readonly defaults: PageSpec;
	/** Preset de orden que no hace falta escribir porque ya es el de casa. */
	readonly defaultSort?: string;
}

/**
 * Versión canónica del query string, para el `<link rel="canonical">`.
 *
 * Quita lo que es igual al valor por defecto y deja las claves en orden estable
 * (`stringifyBrackets` ya ordena). Sin esto, `?pagination[page]=1` y la URL
 * limpia serían dos direcciones distintas con el mismo contenido, que es
 * exactamente el contenido duplicado que penalizan los buscadores.
 */
export const toCanonicalParams = (
	current: URLSearchParams,
	{ defaults, defaultSort }: CanonicalOptions,
): URLSearchParams => {
	const tree = parseBrackets(current);
	const pagination = tree.pagination;

	if (pagination !== undefined && typeof pagination !== "string") {
		if (pagination.page === String(defaults.page)) delete pagination.page;
		if (pagination.pageSize === String(defaults.pageSize)) {
			delete pagination.pageSize;
		}
	}

	if (defaultSort !== undefined && tree.sort === defaultSort) delete tree.sort;

	return stringifyBrackets(tree);
};
