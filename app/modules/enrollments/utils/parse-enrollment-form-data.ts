import type { AppResponse } from "@/shared/response/response.types";

export const INTENT_FIELD = "intent";
export const COURSE_FIELD = "courseDocumentId";
export const USERS_FIELD = "userDocumentIds";
export const GROUPS_FIELD = "groupDocumentIds";

/** Parámetro de la URL con el término del buscador de personas. */
export const PERSON_SEARCH_PARAM = "persona";

export const ENROLLMENT_INTENTS = {
	enroll: "enroll",
	withdraw: "withdraw",
	accept: "accept",
	decline: "decline",
	assign: "assign",
	invite: "invite",
} as const;

export type EnrollmentActionData = AppResponse<null>;

export interface ParsedEnrollmentFormData {
	intent: string | null;
	courseDocumentId: string | undefined;
	userDocumentIds: string[];
	groupDocumentIds: string[];
}

const strings = (formData: FormData, key: string): string[] =>
	formData
		.getAll(key)
		.filter(
			(value): value is string => typeof value === "string" && value !== "",
		);

export function parseEnrollmentFormData(
	formData: FormData,
): ParsedEnrollmentFormData {
	const intent = formData.get(INTENT_FIELD);
	const course = formData.get(COURSE_FIELD);

	return {
		intent: typeof intent === "string" ? intent : null,
		courseDocumentId:
			typeof course === "string" && course !== "" ? course : undefined,
		userDocumentIds: strings(formData, USERS_FIELD),
		groupDocumentIds: strings(formData, GROUPS_FIELD),
	};
}
