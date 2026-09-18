import { recordedOf } from "./evaluation.rules";
import type { EvaluationBoard, EvaluationView } from "./evaluation.types";

export interface EvaluationRaw {
	documentId: string;
	title: string;
	session: { documentId: string } | null;
	results: readonly {
		passed: boolean | null;
		note: string | null;
		user: { documentId: string };
	}[];
}

const toEvaluationView = (raw: EvaluationRaw): EvaluationView => ({
	documentId: raw.documentId,
	title: raw.title,
	sessionDocumentId: raw.session?.documentId ?? null,
	captures: Object.fromEntries(
		raw.results.map((row) => [
			row.user.documentId,
			{ passed: row.passed, note: row.note },
		]),
	),
	recorded: recordedOf(raw.results),
});

export const toEvaluationBoard = (
	rows: readonly EvaluationRaw[],
	canWrite: boolean,
): EvaluationBoard => ({
	canWrite,
	evaluations: rows.map(toEvaluationView),
});
