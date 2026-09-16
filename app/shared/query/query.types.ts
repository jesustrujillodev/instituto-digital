import type * as v from "valibot";
import type { SortDirection } from "@/shared/rules/list.rules";

// ===============================================================
// Vocabulario de filtros en la URL
// ===============================================================
// Notación de brackets al estilo Strapi v4. Es el ESTÁNDAR de la plataforma
// para todo listado filtrable, y por eso vive en shared/ y no en un módulo:
//
//   ?filters[year][$gte]=2020
//   &filters[bodyType][$in]=SUV,PICKUP
//   &filters[$or][0][fuelType][$eq]=HYBRID
//   &pagination[page]=2&pagination[pageSize]=25
//   &sort=listPriceCents:asc
//
// Nada de este archivo importa Prisma ni React: el árbol que se parsea es una
// estructura de datos neutra, y quien la traduce a un `where` (query.prisma.ts)
// tampoco conoce al cliente de la base. Así el mismo parser sirve para una
// consulta en proceso, para un endpoint HTTP o para una prueba unitaria.

/**
 * Operadores de comparación.
 *
 * Se escriben con `$` delante para que NUNCA puedan confundirse con el nombre
 * de un campo: el walker distingue "esto es un operador" de "esto es un tramo
 * de ruta" mirando el primer carácter, y un campo llamado `in` no rompe nada.
 */
export const FILTER_OPERATORS = [
	"$eq",
	"$ne",
	"$lt",
	"$lte",
	"$gt",
	"$gte",
	"$in",
	"$notIn",
	"$contains",
	"$notContains",
	"$startsWith",
	"$endsWith",
	"$between",
	"$null",
	"$notNull",
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const LOGICAL_OPERATORS = ["$and", "$or"] as const;
export type LogicalOperator = (typeof LOGICAL_OPERATORS)[number];

/**
 * Operadores que reciben una LISTA de valores.
 *
 * Determina si `a,b` se parte en dos valores o se conserva entero: en
 * `$contains` la coma es texto que el usuario tecleó, en `$in` es un separador.
 */
export const MULTI_VALUE_OPERATORS = ["$in", "$notIn", "$between"] as const;

/** Operadores que no llevan valor útil más allá de un booleano. */
export const NULLARY_OPERATORS = ["$null", "$notNull"] as const;

// ── Árbol crudo (salida del parser) ───────────────────────────────────────────
// Los valores siguen siendo strings: aquí todavía no se ha validado nada.

export interface FilterLeaf {
	/** Nombre público del campo, con puntos si venía anidado (`brand.slug`). */
	readonly field: string;
	readonly operator: FilterOperator;
	/** Siempre lista, aunque el operador sea de un solo valor. */
	readonly values: readonly string[];
}

export interface FilterGroup {
	readonly operator: LogicalOperator;
	readonly children: readonly FilterNode[];
}

export type FilterNode = FilterLeaf | FilterGroup;

export const isFilterGroup = (node: FilterNode): node is FilterGroup =>
	"children" in node;

export interface SortSpec {
	readonly field: string;
	readonly direction: SortDirection;
}

export interface PageSpec {
	readonly page: number;
	readonly pageSize: number;
}

/** Lo que devuelve el parser: estructura correcta, contenido aún sin confiar. */
export interface ParsedQuery {
	/** Se combinan entre sí con AND. Un `$or` explícito viaja como grupo. */
	readonly filters: readonly FilterNode[];
	readonly pagination: PageSpec;
	readonly sort: readonly SortSpec[];
}

// ── Allowlist por módulo ──────────────────────────────────────────────────────

/**
 * Declaración de UN campo filtrable.
 *
 * Aquí está toda la seguridad de la utilidad. El valor llega del query string
 * —es decir, de cualquiera— y termina dentro de un `where`, así que el parser
 * es deliberadamente permisivo y el filtro real es esta lista: un campo que no
 * esté declarado se descarta, y un operador fuera de `operators` también.
 */
export interface FieldDef {
	/**
	 * Ruta en el modelo de persistencia, con puntos para relaciones.
	 * `"brand.slug"` termina como `{ brand: { slug: … } }`.
	 */
	readonly path: string;
	readonly operators: readonly FilterOperator[];
	/**
	 * Coerción y validación del valor crudo. Recibe el string tal cual y
	 * devuelve lo que se va a poner en el `where` (número, fecha, enum…). Si
	 * lanza, el filtro se descarta en silencio.
	 *
	 * @example v.pipe(v.string(), v.transform(Number), v.integer())
	 */
	readonly schema: v.GenericSchema<string, unknown>;
	/** Solo los campos marcados pueden aparecer en `sort`. */
	readonly sortable?: boolean;
	/**
	 * Ruta alternativa para ordenar, cuando no coincide con la de filtrar.
	 *
	 * El caso típico: se filtra por `brand.slug` —estable, indexado— pero se
	 * ordena por `brand.name`, que es lo que la persona ve. Sin esto habría que
	 * declarar dos campos públicos para la misma cosa.
	 */
	readonly sortPath?: string;
	/**
	 * Condición a medida, para lo que no es una columna.
	 *
	 * La búsqueda libre es el ejemplo: cruza el nombre de la marca, el del
	 * modelo y el de la versión, así que no hay una `path` que la exprese. Se
	 * resuelve al validar y el adaptador de persistencia la usa tal cual.
	 */
	readonly buildCondition?: (
		operator: FilterOperator,
		values: readonly unknown[],
	) => Record<string, unknown>;
}

export type FieldDefs = Readonly<Record<string, FieldDef>>;

// ── Árbol validado (entrada del adaptador de persistencia) ────────────────────

export interface ValidatedLeaf {
	readonly field: string;
	/** Ya resuelta contra `FieldDef.path`. */
	readonly path: string;
	readonly operator: FilterOperator;
	/** Ya coercionados por el esquema del campo. */
	readonly values: readonly unknown[];
	/** Presente solo si el campo declaró `buildCondition`. Gana sobre `path`. */
	readonly override?: Record<string, unknown>;
}

export interface ValidatedGroup {
	readonly operator: LogicalOperator;
	readonly children: readonly ValidatedNode[];
}

export type ValidatedNode = ValidatedLeaf | ValidatedGroup;

export const isValidatedGroup = (node: ValidatedNode): node is ValidatedGroup =>
	"children" in node;

export interface ValidatedSort extends SortSpec {
	readonly path: string;
}

export interface ValidatedQuery {
	readonly filters: readonly ValidatedNode[];
	readonly pagination: PageSpec;
	readonly sort: readonly ValidatedSort[];
}
