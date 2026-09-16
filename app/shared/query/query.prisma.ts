import {
	isValidatedGroup,
	type PageSpec,
	type ValidatedLeaf,
	type ValidatedNode,
	type ValidatedQuery,
	type ValidatedSort,
} from "./query.types";

// ===============================================================
// ValidatedQuery → argumentos de persistencia
// ===============================================================
// Este archivo NO importa `@prisma/client`, y eso es intencional: devuelve
// objetos planos con la forma que Prisma espera, y es la capa de
// infraestructura de cada módulo la que los castea a `Prisma.XWhereInput`. Así
// la utilidad entera se queda en shared/ como código puro —sin cliente de base,
// sin `.server`— y se puede probar sin levantar nada.

/** Objeto plano con la forma de un `where`/`orderBy` de Prisma. */
export type PrismaArgs = Record<string, unknown>;

/**
 * `"brand.slug"` + condición → `{ brand: { slug: condición } }`.
 *
 * Se recorre de derecha a izquierda envolviendo el resultado anterior, que es
 * la forma natural de construir el anidamiento sin índices ni mutación.
 */
const nest = (path: string, condition: unknown): PrismaArgs =>
	path
		.split(".")
		.reduceRight<unknown>(
			(inner, segment) => ({ [segment]: inner }),
			condition,
		) as PrismaArgs;

const INSENSITIVE = { mode: "insensitive" } as const;

/**
 * Hoja validada → condición de Prisma.
 *
 * `$eq` se emite como `{ equals: … }` en vez del atajo `{ campo: valor }`
 * porque el atajo cambia de significado en las relaciones, y aquí la misma
 * función tiene que servir para una columna y para `brand.slug`.
 *
 * `mode: "insensitive"` solo es válido sobre columnas de texto. Quien declara
 * la allowlist es responsable de no ofrecer `$contains` sobre un número: es la
 * misma decisión que ya toma al elegir los operadores de cada campo.
 */
const toCondition = ({ operator, values }: ValidatedLeaf): unknown => {
	const [first, second] = values;

	switch (operator) {
		case "$eq":
			return { equals: first };
		case "$ne":
			return { not: first };
		case "$lt":
			return { lt: first };
		case "$lte":
			return { lte: first };
		case "$gt":
			return { gt: first };
		case "$gte":
			return { gte: first };
		case "$in":
			return { in: [...values] };
		case "$notIn":
			return { notIn: [...values] };
		case "$contains":
			return { contains: first, ...INSENSITIVE };
		case "$notContains":
			return { not: { contains: first, ...INSENSITIVE } };
		case "$startsWith":
			return { startsWith: first, ...INSENSITIVE };
		case "$endsWith":
			return { endsWith: first, ...INSENSITIVE };
		case "$between":
			return { gte: first, lte: second };
		case "$null":
			return first === true ? { equals: null } : { not: null };
		default:
			return first === true ? { not: null } : { equals: null };
	}
};

const toNodeArgs = (node: ValidatedNode): PrismaArgs => {
	if (isValidatedGroup(node)) {
		const key = node.operator === "$or" ? "OR" : "AND";
		return { [key]: node.children.map(toNodeArgs) };
	}

	// Un campo que no es una columna (la búsqueda libre) trae su condición ya
	// resuelta desde la allowlist: aquí solo se coloca.
	return node.override ?? nest(node.path, toCondition(node));
};

/**
 * Filtros validados → `where`.
 *
 * Todas las condiciones se apilan en un `AND` en vez de fundirse en un solo
 * objeto. Fundirlas parece más limpio hasta que llegan `year[$gte]` y
 * `year[$lte]`: comparten clave y la segunda borraría a la primera, dejando un
 * rango abierto sin que nada avise.
 *
 * Devuelve `undefined` —no `{}`— cuando no hay filtros, para poder componerlo
 * con el `where` base del módulo sin añadir ruido a la consulta.
 */
export const toPrismaWhere = (
	nodes: readonly ValidatedNode[],
): PrismaArgs | undefined =>
	nodes.length === 0 ? undefined : { AND: nodes.map(toNodeArgs) };

/** Orden validado → `orderBy`. Lista, no objeto: el orden de los campos importa. */
export const toPrismaOrderBy = (sort: readonly ValidatedSort[]): PrismaArgs[] =>
	sort.map((spec) => nest(spec.path, spec.direction));

/** Paginación por desplazamiento, igual que el resto de los listados del repo. */
export const toPrismaPage = ({
	page,
	pageSize,
}: PageSpec): { skip: number; take: number } => ({
	skip: (page - 1) * pageSize,
	take: pageSize,
});

/** Atajo para los tres a la vez, que es como los consume un repositorio. */
export const toPrismaArgs = (query: ValidatedQuery) => ({
	where: toPrismaWhere(query.filters),
	orderBy: toPrismaOrderBy(query.sort),
	...toPrismaPage(query.pagination),
});
