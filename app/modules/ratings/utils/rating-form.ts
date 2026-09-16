import type { AppResponse } from "@/shared/response/response.types";

export const SCORE_FIELD = "score";
export const COMMENT_FIELD = "comment";

export type RatingActionData = AppResponse<null>;

export const ratePath = (courseDocumentId: string) =>
	`/dashboard/mis-cursos/${courseDocumentId}/valorar`;

/** El número vacío o no numérico llega como `undefined` y lo rechaza la regla. */
export function parseRatingFormData(formData: FormData) {
	const score = formData.get(SCORE_FIELD);
	const comment = formData.get(COMMENT_FIELD);
	const parsed =
		typeof score === "string" && score !== "" ? Number(score) : NaN;

	return {
		score: Number.isFinite(parsed) ? parsed : undefined,
		comment: typeof comment === "string" ? comment : undefined,
	};
}
