// ===============================================================
// Notación de brackets ⇄ árbol
// ===============================================================
// La primitiva genérica de la utilidad: convierte `a[b][0][c]=v` en un objeto
// anidado y de vuelta, sin saber nada de filtros, paginación ni ordenamiento.
// Esa ignorancia es deliberada — query.parser.ts le da significado a las claves
// y este archivo se limita a la forma, así que sirve igual para cualquier otro
// contrato de query string que aparezca en la plataforma.

export type BracketValue = string | BracketNode;
export interface BracketNode {
	[key: string]: BracketValue;
}

/**
 * Tope de anidamiento.
 *
 * El query string es entrada de terceros: sin límite, `a[0][0][0]…` mil veces
 * construye un objeto igual de profundo y todo lo que lo recorra después se
 * come la pila. Ocho tramos son más de lo que necesita `filters[$or][0][rel][campo][$op]`.
 */
const MAX_DEPTH = 8;

/** Tope de parámetros procesados por petición. Descarta el resto sin fallar. */
const MAX_PARAMS = 200;

/** `nombre` seguido de cero o más `[tramo]`, sin brackets sueltos ni anidados. */
const KEY_PATTERN = /^([^[\]]+)((?:\[[^[\]]*\])*)$/;
const SEGMENT_PATTERN = /\[([^[\]]*)\]/g;

/**
 * Tramos que nunca pueden formar parte de una clave.
 *
 * Sin esto, `a[__proto__][x]=1` no crea la propiedad `x` en un objeto: el
 * descenso llega a `Object.prototype` —que no es `undefined`, así que el código
 * lo toma por una rama existente— y la escritura contamina el prototipo de
 * TODOS los objetos del proceso. Es la vulnerabilidad clásica de los parsers de
 * query string anidado, y se corta descartando la clave entera.
 */
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Descompone la clave en sus tramos. `null` si está malformada.
 *
 * Una clave rota (`a[b`, `a]b[`) se descarta entera en vez de intentar
 * adivinarla: interpretar a medias entrada inválida es justo como se cuelan los
 * filtros que nadie escribió.
 */
const toSegments = (key: string): string[] | null => {
	const match = KEY_PATTERN.exec(key);
	if (!match) return null;

	const [, head, rest] = match;
	const segments = [head];

	if (rest) {
		SEGMENT_PATTERN.lastIndex = 0;
		let segment = SEGMENT_PATTERN.exec(rest);
		while (segment !== null) {
			segments.push(segment[1]);
			segment = SEGMENT_PATTERN.exec(rest);
		}
	}

	if (segments.length > MAX_DEPTH) return null;

	return segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))
		? null
		: segments;
};

/** Índice libre más bajo para `campo[]=a&campo[]=b`, que se vuelve `0`, `1`… */
const nextIndex = (node: BracketNode): string => {
	let index = 0;
	while (node[String(index)] !== undefined) index += 1;
	return String(index);
};

/**
 * `URLSearchParams` → árbol anidado.
 *
 * Las listas se representan como objetos de claves numéricas (`{ "0": … }`),
 * igual que hace `qs`. Evita la ambigüedad de decidir sobre la marcha si
 * `campo[0]` es un array o un objeto con la clave "0", que es de donde salen
 * los agujeros cuando el índice llega salteado.
 *
 * Ante un conflicto —una clave que ya tiene valor escalar y ahora quiere ser
 * rama, o al revés— gana el primero y el segundo se descarta. Silencioso a
 * propósito: esto parsea URLs públicas y no debe hacer fallar la página.
 */
export const parseBrackets = (params: URLSearchParams): BracketNode => {
	const root: BracketNode = {};
	let processed = 0;

	for (const [key, rawValue] of params) {
		if (processed >= MAX_PARAMS) break;
		processed += 1;

		const segments = toSegments(key);
		if (!segments) continue;

		let cursor = root;
		let usable = true;

		for (let index = 0; index < segments.length - 1; index += 1) {
			const segment =
				segments[index] === "" ? nextIndex(cursor) : segments[index];
			const existing = cursor[segment];

			if (existing === undefined) {
				const branch: BracketNode = {};
				cursor[segment] = branch;
				cursor = branch;
				continue;
			}

			if (typeof existing === "string") {
				usable = false;
				break;
			}

			cursor = existing;
		}

		if (!usable) continue;

		const last = segments[segments.length - 1];
		const leaf = last === "" ? nextIndex(cursor) : last;
		if (cursor[leaf] === undefined) cursor[leaf] = rawValue;
	}

	return root;
};

/**
 * Ordena las claves de forma estable: los índices numéricos por valor, el resto
 * alfabéticamente y siempre después.
 *
 * Lo numérico no puede ir por texto o `"10"` quedaría antes de `"2"` y el orden
 * de un `$or` dejaría de ser el que se escribió. Y el orden total tiene que ser
 * determinista porque de él sale la URL canónica que se le da a los buscadores:
 * los mismos filtros deben producir siempre exactamente la misma cadena.
 */
export const sortBracketKeys = (keys: readonly string[]): string[] => {
	const numeric: string[] = [];
	const textual: string[] = [];

	for (const key of keys) {
		if (/^\d+$/.test(key)) numeric.push(key);
		else textual.push(key);
	}

	numeric.sort((a, b) => Number(a) - Number(b));
	textual.sort();

	return [...numeric, ...textual];
};

/**
 * Árbol anidado → `URLSearchParams`, con las claves en orden canónico.
 *
 * Inverso exacto de `parseBrackets` para cualquier árbol que este haya
 * producido: la prueba de ida y vuelta lo fija.
 */
export const stringifyBrackets = (node: BracketNode): URLSearchParams => {
	const params = new URLSearchParams();

	const walk = (current: BracketNode, prefix: string): void => {
		for (const key of sortBracketKeys(Object.keys(current))) {
			const value = current[key];
			const path = prefix === "" ? key : `${prefix}[${key}]`;

			if (typeof value === "string") params.append(path, value);
			else walk(value, path);
		}
	};

	walk(node, "");

	return params;
};

/** Lista de valores de un nodo, en orden numérico. `[]` si es una rama vacía. */
export const toValueList = (value: BracketValue | undefined): string[] => {
	if (value === undefined) return [];
	if (typeof value === "string") return [value];

	return sortBracketKeys(Object.keys(value))
		.map((key) => value[key])
		.filter((item): item is string => typeof item === "string");
};
