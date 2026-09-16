import type { AppResponse } from "@/shared/response/response.types";

/** Nombre del campo que transporta la intención de la mutación. */
export const INTENT_FIELD = "intent";

export const TRAINER_INTENTS = {
	activate: "activate",
	update: "update",
	deactivate: "deactivate",
	reactivate: "reactivate",
	createExternal: "create-external",
} as const;

export type TrainerIntent =
	(typeof TRAINER_INTENTS)[keyof typeof TRAINER_INTENTS];

/** Respuesta común de los actions del módulo: envelope estándar sin dato. */
export type TrainerActionData = AppResponse<null>;

export interface ParsedTrainerFormData {
	fields: Record<string, string>;
	intent: string | null;
}

/**
 * Campos de texto e intención de un envío del módulo.
 *
 * Los campos vacíos se descartan: un `<input>` sin rellenar manda `""`, y para
 * los opcionales del dominio `""` no es un valor válido sino su ausencia.
 */
export function parseTrainerFormData(
	formData: FormData,
): ParsedTrainerFormData {
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
