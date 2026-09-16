import type { AppResponse } from "@/shared/response/response.types";

/** Nombre del campo que transporta la intención de la mutación. */
export const INTENT_FIELD = "intent";

/**
 * Intenciones que aceptan los actions del módulo.
 *
 * Viajan como un dato más del envío (y no como estado mutado antes de enviar):
 * así el comportamiento no depende del orden de los efectos y una validación
 * fallida no deja nada a medias.
 */
export const DEPENDENCY_INTENTS = {
	create: "create",
	update: "update",
	archive: "archive",
	unarchive: "unarchive",
	assignHead: "assign-head",
} as const;

export type DependencyIntent =
	(typeof DEPENDENCY_INTENTS)[keyof typeof DEPENDENCY_INTENTS];

/**
 * Respuesta común de los actions del módulo: el envelope estándar sin dato de
 * vuelta —ninguna pantalla lo consume, revalidan el loader.
 *
 * Es una unión discriminada, así que `if (data.success)` estrecha el tipo y
 * `{ success: true, error }` no compila.
 */
export type DependencyActionData = AppResponse<null>;

export interface ParsedDependencyFormData {
	/** Campos de texto listos para validar con valibot. */
	fields: Record<string, string>;
	/** Intención declarada por el formulario que envió. */
	intent: string | null;
}

/**
 * Campos de texto e intención de un envío del módulo.
 *
 * Más simple que su equivalente en `users` porque aquí no viaja ningún archivo:
 * no hace falta rescatar un `File` con `get` antes de recorrer las entradas.
 *
 * Los campos vacíos se descartan: un `<input>` sin rellenar manda `""`, y para
 * los campos opcionales del dominio "" no es un valor válido sino su ausencia —
 * dejarlo pasar guardaría siglas vacías en vez de ninguna.
 */
export function parseDependencyFormData(
	formData: FormData,
): ParsedDependencyFormData {
	const fields: Record<string, string> = {};
	let intent: string | null = null;

	for (const [key, value] of formData.entries()) {
		// Guarda de ejecución: pese al tipo declarado, un envío multipart puede
		// traer File en cualquier clave.
		if (typeof value !== "string") continue;

		if (key === INTENT_FIELD) {
			intent = value;
			continue;
		}

		if (value === "") continue;

		fields[key] = value;
	}

	return { fields, intent };
}
