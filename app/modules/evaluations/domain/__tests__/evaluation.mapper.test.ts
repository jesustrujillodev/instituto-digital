import { describe, expect, test } from "vitest";
import { type EvaluationRaw, toEvaluationBoard } from "../evaluation.mapper";
import {
	ANA_DOC,
	EVALUATION_DOC,
	LUIS_DOC,
	SESSION_DOC,
} from "./evaluation.fixtures";

const rawOf = (overrides: Partial<EvaluationRaw> = {}): EvaluationRaw => ({
	documentId: EVALUATION_DOC,
	title: "Práctica de campo",
	session: { documentId: SESSION_DOC },
	results: [
		{ passed: true, note: null, user: { documentId: ANA_DOC } },
		{
			passed: null,
			note: "Falta que entregue",
			user: { documentId: LUIS_DOC },
		},
	],
	...overrides,
});

describe("toEvaluationBoard", () => {
	test("indexa las capturas por persona y cuenta solo los veredictos", () => {
		const board = toEvaluationBoard([rawOf()], true);
		const evaluation = board.evaluations[0];

		expect(board.canWrite).toBe(true);
		expect(evaluation.sessionDocumentId).toBe(SESSION_DOC);
		expect(evaluation.captures[ANA_DOC]).toEqual({ passed: true, note: null });
		expect(evaluation.captures[LUIS_DOC]).toEqual({
			passed: null,
			note: "Falta que entregue",
		});
		expect(evaluation.recorded).toBe(1);
	});

	test("una evaluación sin sesión proyecta null", () => {
		const board = toEvaluationBoard([rawOf({ session: null })], false);

		expect(board.canWrite).toBe(false);
		expect(board.evaluations[0].sessionDocumentId).toBeNull();
	});

	test("sin capturas el índice queda vacío", () => {
		const board = toEvaluationBoard([rawOf({ results: [] })], true);

		expect(board.evaluations[0].captures).toEqual({});
		expect(board.evaluations[0].recorded).toBe(0);
	});
});
