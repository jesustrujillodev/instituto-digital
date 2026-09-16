import { describe, expect, test } from "vitest";
import {
	validateAssignHead,
	validateCreateDependency,
	validateFindDependency,
	validateListDependencies,
	validateUpdateDependency,
} from "../dependency.validators";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

describe("validateCreateDependency", () => {
	test("devuelve el dto normalizado", () => {
		expect(
			validateCreateDependency({ name: "  Obras Públicas  ", acronym: "SOP" }),
		).toEqual({ name: "Obras Públicas", acronym: "SOP" });
	});

	test("lanza sin nombre", () => {
		expect(() => validateCreateDependency({})).toThrow();
	});
});

describe("validateUpdateDependency", () => {
	test("admite un subconjunto", () => {
		expect(validateUpdateDependency({ acronym: "SOP" })).toEqual({
			acronym: "SOP",
		});
	});

	test("lanza con un nombre inválido", () => {
		expect(() => validateUpdateDependency({ name: "OP" })).toThrow();
	});
});

describe("validateFindDependency", () => {
	test("devuelve el documentId", () => {
		expect(validateFindDependency({ documentId: DOCUMENT_ID })).toEqual({
			documentId: DOCUMENT_ID,
		});
	});

	// La validación de frontera también aplica al parámetro de la URL: un
	// documentId que no es uuid no debe llegar al servicio.
	test("lanza con un documentId que no es uuid", () => {
		expect(() => validateFindDependency({ documentId: "5" })).toThrow();
	});
});

describe("validateAssignHead", () => {
	test("devuelve los dos identificadores", () => {
		expect(
			validateAssignHead({
				documentId: DOCUMENT_ID,
				userDocumentId: USER_DOCUMENT_ID,
			}),
		).toEqual({ documentId: DOCUMENT_ID, userDocumentId: USER_DOCUMENT_ID });
	});

	test("lanza si falta el candidato", () => {
		expect(() => validateAssignHead({ documentId: DOCUMENT_ID })).toThrow();
	});
});

describe("validateListDependencies", () => {
	test("acepta un objeto vacío", () => {
		expect(validateListDependencies({})).toEqual({});
	});

	test("lanza con un sortBy fuera de la allowlist", () => {
		expect(() => validateListDependencies({ sortBy: "id" })).toThrow();
	});
});
