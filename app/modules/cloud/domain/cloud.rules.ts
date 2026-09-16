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
	v.string(),
	v.minLength(1, "Key vacía"),
	v.maxLength(MAX_KEY_LENGTH, "Key demasiado larga"),
	v.check((key) => !key.endsWith("/"), "Una key no puede acabar en /"),
	v.check(isCanonicalPath, "Key inválida"),
);

/**
 * Carpeta sobre la que se opera: acaba en `/` y NUNCA es la raíz. Borrar o
 * descargar el bucket entero no es algo que deba estar a un clic.
 */
export const cloudPrefixRule = v.pipe(
	v.string(),
	v.minLength(1, "Carpeta vacía"),
	v.maxLength(MAX_KEY_LENGTH, "Carpeta demasiado larga"),
	v.check((prefix) => prefix.endsWith("/"), "Una carpeta acaba en /"),
	v.check(isCanonicalPath, "Carpeta inválida"),
);

/** Carpeta que se lista o escanea: aquí la raíz (`""`) sí vale. */
export const cloudPathRule = v.union([v.literal(""), cloudPrefixRule]);

export const cloudListRule = v.object({
	path: cloudPathRule,
	cursor: v.nullish(v.pipe(v.string(), v.maxLength(4096))),
});

export const cloudSelectionRule = v.pipe(
	v.object({
		keys: v.pipe(
			v.array(cloudKeyRule),
			v.maxLength(CLOUD_LIMITS.maxSelection, "Demasiados archivos"),
		),
		prefixes: v.pipe(
			v.array(cloudPrefixRule),
			v.maxLength(CLOUD_LIMITS.maxSelection, "Demasiadas carpetas"),
		),
	}),
	v.check(
		(selection) => selection.keys.length + selection.prefixes.length > 0,
		"Selecciona al menos un archivo o carpeta",
	),
);

export const validateCloudList = (data: unknown) =>
	v.parse(cloudListRule, data);
export const validateCloudKey = (data: unknown) => v.parse(cloudKeyRule, data);
export const validateCloudPath = (data: unknown) =>
	v.parse(cloudPathRule, data);
export const validateCloudSelection = (data: unknown) =>
	v.parse(cloudSelectionRule, data);
