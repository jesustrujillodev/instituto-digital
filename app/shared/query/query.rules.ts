import * as v from "valibot";
import {
	type FieldDef,
	type FieldDefs,
	type FilterNode,
	type FilterOperator,
	isFilterGroup,
	NULLARY_OPERATORS,
	type ParsedQuery,
	type ValidatedNode,
	type ValidatedQuery,
	type ValidatedSort,
} from "./query.types";

// ===============================================================
// ParsedQuery → ValidatedQuery
// ===============================================================
// La frontera de confianza de toda la utilidad. Hasta aquí el árbol venía de la
// URL y por tanto de cualquiera; a partir de aquí cada hoja tiene un campo que
// el módulo declaró, un operador que ese campo admite y un valor ya coercionado
// al tipo correcto.
//
// Política ante lo que no encaja: DESCARTAR EN SILENCIO, nunca lanzar. Estos
// filtros vienen de URLs públicas que se comparten, se recortan y las recorren
// bots; un parámetro sobrante o mal escrito tiene que degradar a "ese filtro no
// se aplica", no a un error de página.

/** Número de valores que exige cada operador. */
const ARITY: Readonly<Record<FilterOperator, "one" | "two" | "many">> = {
	$eq: "one",
	$ne: "one",
	$lt: "one",
	$lte: "one",
	$gt: "one",
	$gte: "one",
	$in: "many",
	$notIn: "many",
	$contains: "one",
	$notContains: "one",
	$startsWith: "one",
	$endsWith: "one",
	$between: "two",
	$null: "one",
	$notNull: "one",
};

const NULLARY_SET = new Set<string>(NULLARY_OPERATORS);

const TRUTHY = new Set(["true", "1"]);
const FALSY = new Set(["false", "0"]);

const hasValidArity = (
	operator: FilterOperator,
	values: readonly string[],
): boolean => {
	switch (ARITY[operator]) {
		case "one":
			return values.length === 1;
		case "two":
			return values.length === 2;
		default:
			return values.length >= 1;
	}
};

/**
 * Coerciona los valores de una hoja con el esquema declarado del campo.
 *
 * `$null` y `$notNull` se saltan el esquema a propósito: su valor no es un dato
 * del campo sino un booleano sobre su existencia, y pasarlo por un esquema de
 * —digamos— número entero lo tumbaría siempre.
 */
const toValues = (
	operator: FilterOperator,
	rawValues: readonly string[],
	definition: FieldDef,
): unknown[] | null => {
	if (NULLARY_SET.has(operator)) {
		const raw = rawValues[0].toLowerCase();
		if (TRUTHY.has(raw)) return [true];
		if (FALSY.has(raw)) return [false];
		return null;
	}

	const values: unknown[] = [];

	for (const raw of rawValues) {
		const result = v.safeParse(definition.schema, raw);
		if (!result.success) return null;
		values.push(result.output);
	}

	return values;
};

const validateNodes = (
	nodes: readonly FilterNode[],
	fields: FieldDefs,
): ValidatedNode[] => {
	const validated: ValidatedNode[] = [];

	for (const node of nodes) {
		if (isFilterGroup(node)) {
			const children = validateNodes(node.children, fields);
			// Un grupo que se quedó sin hijos válidos no es "todo" ni "nada": es
			// una condición que nadie escribió. Se cae entero.
			if (children.length > 0) {
				validated.push({ operator: node.operator, children });
			}
			continue;
		}

		// `hasOwn` y no un simple acceso: `fields["constructor"]` devolvería la
		// función heredada de Object y el `.operators` de después reventaría. El
		// parser ya descarta esos tramos, pero la allowlist es la frontera de
		// confianza y no debe depender de que alguien más filtre antes.
		if (!Object.hasOwn(fields, node.field)) continue;

		const definition = fields[node.field];
		if (!definition.operators.includes(node.operator)) continue;
		if (!hasValidArity(node.operator, node.values)) continue;

		const values = toValues(node.operator, node.values, definition);
		if (!values) continue;

		validated.push({
			field: node.field,
			path: definition.path,
			operator: node.operator,
			values,
			...(definition.buildCondition && {
				override: definition.buildCondition(node.operator, values),
			}),
		});
	}

	return validated;
};

export interface QueryValidateOptions {
	readonly fields: FieldDefs;
	/** Se aplica cuando la URL no pide ningún orden válido. */
	readonly defaultSort?: readonly ValidatedSort[];
	readonly maxSortFields?: number;
}

const DEFAULT_MAX_SORT_FIELDS = 3;

/**
 * Valida el orden pedido contra la allowlist.
 *
 * `sortable` es una marca aparte de `operators` porque no son lo mismo: hay
 * campos por los que tiene sentido filtrar y no ordenar (una relación que no
 * está indexada), y ordenar por una columna sin índice es justo el tipo de
 * consulta que alguien puede disparar desde la URL sin querer.
 */
const validateSort = (
	parsed: ParsedQuery,
	{ fields, defaultSort = [], maxSortFields }: QueryValidateOptions,
): ValidatedSort[] => {
	const seen = new Set<string>();
	const sort: ValidatedSort[] = [];

	for (const spec of parsed.sort) {
		if (sort.length >= (maxSortFields ?? DEFAULT_MAX_SORT_FIELDS)) break;

		if (!Object.hasOwn(fields, spec.field)) continue;
		if (!fields[spec.field].sortable) continue;
		if (seen.has(spec.field)) continue;

		const definition = fields[spec.field];

		seen.add(spec.field);
		sort.push({ ...spec, path: definition.sortPath ?? definition.path });
	}

	return sort.length > 0 ? sort : [...defaultSort];
};

export const validateQuery = (
	parsed: ParsedQuery,
	options: QueryValidateOptions,
): ValidatedQuery => ({
	filters: validateNodes(parsed.filters, options.fields),
	pagination: parsed.pagination,
	sort: validateSort(parsed, options),
});

/**
 * Azúcar para declarar la allowlist de un módulo sin perder el estrechamiento
 * de las claves: dado un `FIELD_DEFS` con la clave `name`, `FIELD_DEFS.name`
 * existe como tipo y `.nombre` no compila.
 */
export const defineFields = <T extends FieldDefs>(fields: T): T => fields;
