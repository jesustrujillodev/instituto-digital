import type { AppResponse } from "@/shared/response/response.types";

export const INTENT_FIELD = "intent";
export const LINE_FIELD = "lineDocumentId";
export const PAYLOAD_FIELD = "payload";
export const YEAR_FIELD = "fiscalYear";

export const PLAN_INTENTS = {
	createPlan: "createPlan",
	addLine: "addLine",
	updateLine: "updateLine",
	cancelLine: "cancelLine",
	reactivateLine: "reactivateLine",
	deleteLine: "deleteLine",
} as const;

export type PlanActionData = AppResponse<null>;

/** Parámetro del filtro de dependencia del alcance global. */
export const DEPENDENCY_PARAM = "dependencia";

export interface ParsedPlanFormData {
	intent: string | null;
	lineDocumentId: string | undefined;
	/** `undefined` si falta o no es JSON: la validación lo rechaza después. */
	payload: unknown;
	fiscalYear: number | undefined;
}

const text = (formData: FormData, key: string) => {
	const value = formData.get(key);
	return typeof value === "string" && value !== "" ? value : undefined;
};

/** La línea viaja como JSON en un campo, igual que el formulario de cursos. */
export function parsePlanFormData(formData: FormData): ParsedPlanFormData {
	const raw = text(formData, PAYLOAD_FIELD);
	let payload: unknown;
	if (raw) {
		try {
			payload = JSON.parse(raw);
		} catch {
			payload = undefined;
		}
	}

	const year = text(formData, YEAR_FIELD);

	return {
		intent: text(formData, INTENT_FIELD) ?? null,
		lineDocumentId: text(formData, LINE_FIELD),
		payload,
		fiscalYear: year === undefined ? undefined : Number(year),
	};
}
