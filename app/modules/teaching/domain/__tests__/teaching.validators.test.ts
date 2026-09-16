import { describe, expect, test } from "vitest";
import {
	validateSaveAttendance,
	validateSaveResults,
} from "../teaching.validators";
import { ANA_DOC, SESSION_DOCS } from "./teaching.fixtures";

describe("validateSaveAttendance", () => {
	test("acepta una lista con al menos una marca", () => {
		expect(
			validateSaveAttendance({
				sessionDocumentId: SESSION_DOCS[0],
				marks: [{ userDocumentId: ANA_DOC, attended: true }],
			}),
		).toEqual({
			sessionDocumentId: SESSION_DOCS[0],
			marks: [{ userDocumentId: ANA_DOC, attended: true }],
		});
	});

	test("rechaza una lista vacía o una marca que no es booleana", () => {
		expect(() =>
			validateSaveAttendance({ sessionDocumentId: SESSION_DOCS[0], marks: [] }),
		).toThrow();
		expect(() =>
			validateSaveAttendance({
				sessionDocumentId: SESSION_DOCS[0],
				marks: [{ userDocumentId: ANA_DOC, attended: "sí" }],
			}),
		).toThrow();
	});
});

describe("validateSaveResults", () => {
	test("la nota es opcional y se normaliza a null", () => {
		expect(
			validateSaveResults({
				entries: [{ userDocumentId: ANA_DOC, result: "PASSED" }],
			}).entries[0],
		).toEqual({ userDocumentId: ANA_DOC, result: "PASSED", grade: null });
	});

	test("la nota va de 0 a 100 y es entera", () => {
		const entry = (grade: number) => ({
			entries: [{ userDocumentId: ANA_DOC, result: "FAILED", grade }],
		});

		expect(() => validateSaveResults(entry(0))).not.toThrow();
		expect(() => validateSaveResults(entry(100))).not.toThrow();
		expect(() => validateSaveResults(entry(101))).toThrow();
		expect(() => validateSaveResults(entry(85.5))).toThrow();
	});

	test("un resultado pendiente no lleva nota", () => {
		expect(() =>
			validateSaveResults({
				entries: [{ userDocumentId: ANA_DOC, result: "PENDING", grade: 70 }],
			}),
		).toThrow();
	});
});
