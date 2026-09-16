import type { AppResponse } from "@/shared/response/response.types";

/** Nombre del campo que transporta la intención de la mutación. */
export const INTENT_FIELD = "intent";

/**
 * Campo que transporta el curso completo como JSON.
 *
 * El formulario de cursos lleva colecciones anidadas —sesiones con varios
 * campos, capacitadores y dos listas de audiencia— y números y booleanos. Con
 * un campo por clave, el servidor tendría que mantener a mano la lista de qué
 * es JSON, qué es número y qué es booleano, y esa lista se desincroniza del
 * esquema en cuanto alguien añade un campo. Un solo JSON conserva los tipos y
 * deja la validación entera a la misma regla valibot que usa el cliente.
 */
export const PAYLOAD_FIELD = "payload";

export const COURSE_INTENTS = {
	create: "create",
	update: "update",
	publish: "publish",
	cancel: "cancel",
} as const;

export type CourseIntent = (typeof COURSE_INTENTS)[keyof typeof COURSE_INTENTS];

/** Respuesta común de los actions del módulo: envelope estándar sin dato. */
export type CourseActionData = AppResponse<null>;

export interface ParsedCourseFormData {
	fields: Record<string, string>;
	intent: string | null;
	/**
	 * El curso decodificado, o `null` si no vino o no es JSON válido. `null` no
	 * se trata aparte: la regla de entrada lo rechaza como cualquier dato malo.
	 */
	payload: unknown;
}

export function parseCourseFormData(formData: FormData): ParsedCourseFormData {
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

	return { fields, intent, payload: decodePayload(fields[PAYLOAD_FIELD]) };
}

const decodePayload = (raw: string | undefined): unknown => {
	if (raw === undefined) return null;

	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
};
