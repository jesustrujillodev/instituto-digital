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
	uploadUrl: "upload-url",
	saveMaterial: "save-material",
} as const;

export type ContentActionData = AppResponse<null>;

export const contentPath = (courseDocumentId: string) =>
	`/dashboard/cursos/${courseDocumentId}/contenido`;

/**
 * La ruta del material de una lección.
 *
 * Es aparte del temario para que el árbol no cargue el cuerpo de cada lección:
 * el panel lo pide con `fetcher.load` cuando se abre, y escribe contra la misma
 * ruta. Así las dos superficies —el paso del alta y la pantalla del curso
 * publicado— siguen montando el mismo panel.
 */
export const materialPath = (
	courseDocumentId: string,
	lessonDocumentId: string,
) => `${contentPath(courseDocumentId)}/${lessonDocumentId}`;

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
