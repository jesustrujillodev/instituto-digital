import type { AppResponse } from "@/shared/response/response.types";

export const INTENT_FIELD = "intent";
export const PAYLOAD_FIELD = "payload";

export const TEACHING_INTENTS = {
	attendance: "attendance",
	results: "results",
	finish: "finish",
} as const;

export type TeachingActionData = AppResponse<null>;

export interface ParsedTeachingFormData {
	intent: string | null;
	/** `undefined` si falta o no es JSON: la validación lo rechaza después. */
	payload: unknown;
}

/**
 * La lista y los resultados viajan como un JSON en un solo campo, igual que el
 * formulario de cursos: con un campo por persona el servidor tendría que saber
 * a mano qué es booleano y qué es número.
 */
export function parseTeachingFormData(
	formData: FormData,
): ParsedTeachingFormData {
	const intent = formData.get(INTENT_FIELD);
	const raw = formData.get(PAYLOAD_FIELD);

	let payload: unknown;
	if (typeof raw === "string") {
		try {
			payload = JSON.parse(raw);
		} catch {
			payload = undefined;
		}
	}

	return { intent: typeof intent === "string" ? intent : null, payload };
}
