import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	EVALUATION_NOTE_MAX_LENGTH,
	EVALUATION_TITLE_MAX_LENGTH,
} from "../evaluation.config";
import { EVALUATION_ERROR_CODES } from "../evaluation.errors";
import { recordedOf, resolveCaptureWrites } from "../evaluation.rules";
import {
	validateCreateEvaluation,
	validateSaveEvaluationResults,
} from "../evaluation.validators";
import {
	ANA_DOC,
	EVALUATION_DOC,
	LUIS_DOC,
	SESSION_DOC,
	targetOf,
} from "./evaluation.fixtures";

const codeOf = (work: () => unknown): string | undefined => {
	try {
		work();
	} catch (error) {
		return isDomainError(error) ? error.code : undefined;
	}
};

const entry = (
	userDocumentId: string,
	passed: boolean | null,
	note?: string,
) => ({ userDocumentId, passed, note });

const resultsPayload = (entries: unknown[]) => ({
	evaluationDocumentId: EVALUATION_DOC,
	entries,
});

describe("validateCreateEvaluation", () => {
	test("la sesión es opcional y se normaliza a null", () => {
		expect(validateCreateEvaluation({ title: "Práctica" })).toEqual({
			title: "Práctica",
			sessionDocumentId: null,
		});
	});

	test("el título se recorta y no puede quedar vacío", () => {
		expect(
			validateCreateEvaluation({
				title: "  Proyecto final  ",
				sessionDocumentId: SESSION_DOC,
			}).title,
		).toBe("Proyecto final");
		expect(() => validateCreateEvaluation({ title: "   " })).toThrow();
	});

	test("el título tiene tope de longitud", () => {
		const title = (length: number) => ({ title: "x".repeat(length) });

		expect(() =>
			validateCreateEvaluation(title(EVALUATION_TITLE_MAX_LENGTH)),
		).not.toThrow();
		expect(() =>
			validateCreateEvaluation(title(EVALUATION_TITLE_MAX_LENGTH + 1)),
		).toThrow();
	});
});

describe("validateSaveEvaluationResults", () => {
	test("la observación se recorta y se normaliza a null", () => {
		const entries = validateSaveEvaluationResults(
			resultsPayload([
				entry(ANA_DOC, true, "  Entregó a tiempo  "),
				entry(LUIS_DOC, null, "   "),
			]),
		).entries;

		expect(entries[0].note).toBe("Entregó a tiempo");
		expect(entries[1].note).toBeNull();
	});

	test("la observación puede ir sin veredicto", () => {
		expect(() =>
			validateSaveEvaluationResults(
				resultsPayload([entry(ANA_DOC, null, "Falta que entregue")]),
			),
		).not.toThrow();
	});

	test("la observación tiene tope de longitud", () => {
		const note = (length: number) =>
			resultsPayload([entry(ANA_DOC, true, "x".repeat(length))]);

		expect(() =>
			validateSaveEvaluationResults(note(EVALUATION_NOTE_MAX_LENGTH)),
		).not.toThrow();
		expect(() =>
			validateSaveEvaluationResults(note(EVALUATION_NOTE_MAX_LENGTH + 1)),
		).toThrow();
	});
});

describe("resolveCaptureWrites", () => {
	test("una captura idéntica no se reescribe", () => {
		const target = targetOf({
			results: [{ userId: 50, passed: true, note: "Bien" }],
		});

		expect(
			resolveCaptureWrites(target, [
				{ userDocumentId: ANA_DOC, passed: true, note: "Bien" },
			]),
		).toEqual({ writes: [], deletes: [] });
	});

	test("un cambio de observación cuenta como cambio", () => {
		const target = targetOf({
			results: [{ userId: 50, passed: true, note: "Bien" }],
		});

		expect(
			resolveCaptureWrites(target, [
				{ userDocumentId: ANA_DOC, passed: true, note: "Excelente" },
			]),
		).toEqual({
			writes: [{ userId: 50, passed: true, note: "Excelente" }],
			deletes: [],
		});
	});

	test("vaciar los dos campos borra la captura", () => {
		const target = targetOf({
			results: [{ userId: 50, passed: false, note: "Faltó la práctica" }],
		});

		expect(
			resolveCaptureWrites(target, [
				{ userDocumentId: ANA_DOC, passed: null, note: null },
			]),
		).toEqual({ writes: [], deletes: [50] });
	});

	test("vaciar lo que ya estaba vacío no genera baja", () => {
		expect(
			resolveCaptureWrites(targetOf(), [
				{ userDocumentId: ANA_DOC, passed: null, note: null },
			]),
		).toEqual({ writes: [], deletes: [] });
	});

	test("una observación sin veredicto se guarda igual", () => {
		expect(
			resolveCaptureWrites(targetOf(), [
				{ userDocumentId: LUIS_DOC, passed: null, note: "Falta que entregue" },
			]),
		).toEqual({
			writes: [{ userId: 51, passed: null, note: "Falta que entregue" }],
			deletes: [],
		});
	});

	test("quien ya no está inscrito rechaza el envío entero", () => {
		expect(
			codeOf(() =>
				resolveCaptureWrites(targetOf({ participants: [] }), [
					{ userDocumentId: ANA_DOC, passed: true, note: null },
				]),
			),
		).toBe(EVALUATION_ERROR_CODES.UNKNOWN_PARTICIPANT);
	});
});

describe("recordedOf", () => {
	test("cuenta solo a quienes tienen veredicto", () => {
		expect(
			recordedOf([{ passed: true }, { passed: false }, { passed: null }]),
		).toBe(2);
	});
});
