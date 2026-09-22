import * as v from "valibot";
import { CLOUD_LIMITS } from "./cloud.config";

// ===============================================================
// Keys y carpetas que llegan del cliente
// ===============================================================
// El gestor recibe rutas de storage tecleables (la carpeta viaja en la URL) y
// las usa para listar, firmar y BORRAR. Todo lo que no tenga forma de ruta
// canónica se rechaza aquí, antes de llegar al proveedor.

const MAX_KEY_LENGTH = 1024;

// Caracteres de control (U+0000–U+001F y U+007F): una key con saltos de línea
// acabaría dentro de un header.
const hasControlChars = (text: string): boolean =>
	[...text].some((char) => {
		const code = char.charCodeAt(0);
		return code < 0x20 || code === 0x7f;
	});

/** Ruta canónica: sin `/` inicial, sin segmentos vacíos, `.` ni `..`. */
const isCanonicalPath = (path: string): boolean => {
	if (path.startsWith("/") || hasControlChars(path)) return false;

	const segments = (path.endsWith("/") ? path.slice(0, -1) : path).split("/");

	return segments.every(
		(segment) => segment !== "" && segment !== "." && segment !== "..",
	);
};

/** Key de un objeto: nunca acaba en `/`. */
export const cloudKeyRule = v.pipe(
	v.string("Falta la ruta del archivo."),
	v.minLength(1, "La ruta del archivo no puede estar vacía."),
	v.maxLength(
		MAX_KEY_LENGTH,
		`La ruta del archivo no puede superar los ${MAX_KEY_LENGTH} caracteres.`,
	),
	v.check(
		(key) => !key.endsWith("/"),
		"La ruta de un archivo no puede terminar en /.",
	),
	v.check(isCanonicalPath, "La ruta del archivo no es válida."),
);

/**
 * Carpeta sobre la que se opera: acaba en `/` y NUNCA es la raíz. Borrar o
 * descargar el bucket entero no es algo que deba estar a un clic.
 */
export const cloudPrefixRule = v.pipe(
	v.string("Falta la ruta de la carpeta."),
	v.minLength(1, "La ruta de la carpeta no puede estar vacía."),
	v.maxLength(
		MAX_KEY_LENGTH,
		`La ruta de la carpeta no puede superar los ${MAX_KEY_LENGTH} caracteres.`,
	),
	v.check(
		(prefix) => prefix.endsWith("/"),
		"La ruta de una carpeta debe terminar en /.",
	),
	v.check(isCanonicalPath, "La ruta de la carpeta no es válida."),
);

/** Carpeta que se lista o escanea: aquí la raíz (`""`) sí vale. */
export const cloudPathRule = v.union(
	[v.literal(""), cloudPrefixRule],
	"La ruta indicada no es válida.",
);

export const cloudListRule = v.object({
	path: cloudPathRule,
	cursor: v.nullish(
		v.pipe(
			v.string("El cursor de paginación debe ser texto."),
			v.maxLength(4096, "El cursor de paginación es demasiado largo."),
		),
	),
});

export const cloudSelectionRule = v.pipe(
	v.object({
		keys: v.pipe(
			v.array(cloudKeyRule, "Revisa los archivos seleccionados."),
			v.maxLength(
				CLOUD_LIMITS.maxSelection,
				`No puedes seleccionar más de ${CLOUD_LIMITS.maxSelection} archivos a la vez.`,
			),
		),
		prefixes: v.pipe(
			v.array(cloudPrefixRule, "Revisa las carpetas seleccionadas."),
			v.maxLength(
				CLOUD_LIMITS.maxSelection,
				`No puedes seleccionar más de ${CLOUD_LIMITS.maxSelection} carpetas a la vez.`,
			),
		),
	}),
	v.check(
		(selection) => selection.keys.length + selection.prefixes.length > 0,
		"Selecciona al menos un archivo o una carpeta.",
	),
);

export const validateCloudList = (data: unknown) =>
	v.parse(cloudListRule, data);
export const validateCloudKey = (data: unknown) => v.parse(cloudKeyRule, data);
export const validateCloudPath = (data: unknown) =>
	v.parse(cloudPathRule, data);
export const validateCloudSelection = (data: unknown) =>
	v.parse(cloudSelectionRule, data);
