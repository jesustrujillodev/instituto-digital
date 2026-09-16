// Aritmética de rutas de storage — funciones puras.
//
// En storage no existen carpetas: una "carpeta" es un prefijo de key acabado en
// `/`. Estas funciones son las únicas que parten y recomponen esos prefijos, para
// que ninguna pantalla ni caso de uso lo haga con su propio `split`.

import { InvalidCloudCursorError } from "./cloud.errors";

/** Carpeta que contiene la key o la carpeta: `a/b/c.jpg` → `a/b/`, `a/b/` → `a/`. */
export const parentFolder = (path: string): string => {
	const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
	const slash = trimmed.lastIndexOf("/");

	return slash < 0 ? "" : trimmed.slice(0, slash + 1);
};

/** Último segmento, sin la barra final: `a/b/` → `b`, `a/c.jpg` → `c.jpg`. */
export const lastSegment = (path: string): string => {
	const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;

	return trimmed.slice(trimmed.lastIndexOf("/") + 1);
};

/** Cadena de carpetas desde la raíz hasta `path`, para las migas. */
export const folderTrail = (
	path: string,
): { prefix: string; name: string }[] => {
	const segments = path.split("/").filter(Boolean);

	return segments.map((name, index) => ({
		prefix: `${segments.slice(0, index + 1).join("/")}/`,
		name,
	}));
};

/**
 * Carpeta más profunda que contiene a todas las rutas dadas.
 *
 * Es la base contra la que se calculan las rutas dentro de un ZIP: seleccionar
 * `media/cursos/` y `media/avisos/` produce un ZIP con `cursos/…` y
 * `avisos/…`, no con `media/cursos/…`.
 */
export const commonFolder = (paths: readonly string[]): string => {
	if (paths.length === 0) return "";

	const split = paths.map((path) =>
		parentFolder(path).split("/").filter(Boolean),
	);
	const shared: string[] = [];

	for (let index = 0; index < split[0].length; index++) {
		const segment = split[0][index];
		if (!split.every((segments) => segments[index] === segment)) break;
		shared.push(segment);
	}

	return shared.length === 0 ? "" : `${shared.join("/")}/`;
};

// ── Cursor compuesto ──────────────────────────────────────────────────────────
// Con dos buckets, una página del listado es la suma de una página de cada uno,
// y cada proveedor devuelve su propio token. El cursor que ve el cliente guarda
// los dos; un bucket agotado simplemente no aparece.

export type BucketCursors = Record<string, string>;

const toBase64Url = (text: string) =>
	btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (text: string) =>
	atob(text.replace(/-/g, "+").replace(/_/g, "/"));

/** `null` cuando ningún bucket tiene más páginas. */
export const encodeCursor = (cursors: BucketCursors): string | null =>
	Object.keys(cursors).length === 0
		? null
		: toBase64Url(JSON.stringify(cursors));

/** @throws InvalidCloudCursorError si el texto no es un cursor emitido aquí. */
export const decodeCursor = (cursor: string): BucketCursors => {
	try {
		const parsed: unknown = JSON.parse(fromBase64Url(cursor));
		const valid =
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed) &&
			Object.values(parsed).every((token) => typeof token === "string");

		if (!valid || Object.keys(parsed).length === 0) {
			throw new InvalidCloudCursorError();
		}

		return parsed as BucketCursors;
	} catch {
		throw new InvalidCloudCursorError();
	}
};
