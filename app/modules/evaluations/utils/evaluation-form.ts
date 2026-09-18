import type { AppResponse } from "@/shared/response/response.types";

export const INTENT_FIELD = "intent";
export const PAYLOAD_FIELD = "payload";

export const EVALUATION_INTENTS = {
	create: "create",
	update: "update",
	remove: "remove",
	results: "results",
} as const;

export type EvaluationActionData = AppResponse<null>;

export const evaluationsPath = (courseDocumentId: string) =>
	`/dashboard/imparticion/${courseDocumentId}/evaluaciones`;

export interface ParsedEvaluationFormData {
	intent: string | null;
	/** `undefined` si falta o no es JSON: la validacion lo rechaza despues. */
	payload: unknown;
}

/** Un JSON en un solo campo, igual que el formulario de la ficha. */
export function parseEvaluationFormData(
	formData: FormData,
): ParsedEvaluationFormData {
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
