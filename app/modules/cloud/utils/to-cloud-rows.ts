import { lastSegment } from "../domain/cloud.paths";
import type {
	CloudCrumb,
	CloudFolder,
	CloudListing,
	CloudObject,
} from "../domain/cloud.types";

// ===============================================================
// Del listado a lo que pinta la pantalla — funciones puras
// ===============================================================

/**
 * Fila de la tabla o celda de la cuadrícula.
 *
 * El `id` es la ruta completa: una carpeta acaba en `/` y una key nunca, así que
 * los dos tipos no pueden chocar dentro de una misma selección.
 */
export type CloudRow =
	| { id: string; kind: "folder"; folder: CloudFolder }
	| { id: string; kind: "file"; object: CloudObject };

/** Carpetas primero, como en cualquier explorador; después archivos. */
export const toCloudRows = (
	pages: readonly Pick<CloudListing, "folders" | "objects">[],
): CloudRow[] => {
	const folders = new Map<string, CloudFolder>();
	const objects = new Map<string, CloudObject>();

	// Con dos buckets, una carpeta raíz puede llegar repetida en páginas
	// distintas: se deduplica por ruta.
	for (const page of pages) {
		for (const folder of page.folders) folders.set(folder.prefix, folder);
		for (const object of page.objects) objects.set(object.key, object);
	}

	return [
		...[...folders.values()].map((folder) => ({
			id: folder.prefix,
			kind: "folder" as const,
			folder,
		})),
		...[...objects.values()].map((object) => ({
			id: object.key,
			kind: "file" as const,
			object,
		})),
	];
};

/** Nombre que se enseña: el legible si algún módulo lo conoce. */
export const displayNameOf = (row: CloudRow): string =>
	row.kind === "folder"
		? (row.folder.label ?? row.folder.name)
		: row.object.name;

/** Ids seleccionados → cuerpo de la petición. */
export const toSelection = (ids: Iterable<string>) => {
	const keys: string[] = [];
	const prefixes: string[] = [];
	for (const id of ids) (id.endsWith("/") ? prefixes : keys).push(id);
	return { keys, prefixes };
};

/** Enlace a una carpeta del gestor. */
export const folderHref = (prefix: string) =>
	prefix
		? `/dashboard/nube?path=${encodeURIComponent(prefix)}`
		: "/dashboard/nube";

/** Nombre legible de una miga: el del módulo o el segmento crudo. */
export const crumbLabel = (crumb: CloudCrumb) => crumb.label ?? crumb.name;

/**
 * Nombre que se propone al guardar el ZIP.
 *
 * Se calcula en el navegador porque el diálogo de guardado tiene que abrirse
 * DENTRO del clic —lo exige el navegador—, antes de que el servidor conteste.
 * Sigue la misma regla que el servidor: una carpeta sola da su nombre.
 */
export const suggestedZipName = (
	selection: { keys: readonly string[]; prefixes: readonly string[] },
	currentPath: string,
): string => {
	if (selection.prefixes.length === 1 && selection.keys.length === 0) {
		return `${lastSegment(selection.prefixes[0])}.zip`;
	}

	return currentPath ? `${lastSegment(currentPath)}.zip` : "nube.zip";
};

/**
 * Texto que hay que escribir para confirmar un borrado que incluye carpetas.
 *
 * Una carpeta: su nombre, que obliga a leer QUÉ se borra. Varias: la palabra
 * "eliminar", porque pedir varios nombres no añade atención, solo fricción.
 * Solo archivos: nada, basta con el diálogo.
 */
export const deleteConfirmationPhrase = (selection: {
	prefixes: readonly string[];
}): string | null => {
	if (selection.prefixes.length === 0) return null;
	if (selection.prefixes.length === 1)
		return lastSegment(selection.prefixes[0]);
	return "eliminar";
};
