import type { AppResponse } from "@/shared/response/response.types";

export const INTENT_FIELD = "intent";
export const PAYLOAD_FIELD = "payload";

export const CONTENT_INTENTS = {
	createModule: "create-module",
	updateModule: "update-module",
	archiveModule: "archive-module",
	createLesson: "create-lesson",
	updateLesson: "update-lesson",
	archiveLesson: "archive-lesson",
	reorder: "reorder",
} as const;

export type ContentActionData = AppResponse<null>;

export const contentPath = (courseDocumentId: string) =>
	`/dashboard/cursos/${courseDocumentId}/contenido`;

export interface ParsedContentFormData {
	intent: string | null;
	/** `undefined` si falta o no es JSON: la validación lo rechaza después. */
	payload: unknown;
}

/** Un JSON en un solo campo, igual que el resto de paneles del proyecto. */
export function parseContentFormData(
	formData: FormData,
): ParsedContentFormData {
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
