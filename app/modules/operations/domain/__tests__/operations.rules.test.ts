import { describe, expect, test } from "vitest";
import { ERROR_PREVIEW_LENGTH } from "../operations.config";
import { pageWindowOf, previewError } from "../operations.rules";
import { validateOperationsList } from "../operations.validators";

describe("previewError", () => {
	test("aplana saltos de línea y espacios de un stack", () => {
		expect(previewError("Error: SMTP 550\n    at send (mailer.ts:12)")).toBe(
			"Error: SMTP 550 at send (mailer.ts:12)",
		);
	});

	test("recorta al tope con puntos suspensivos", () => {
		const preview = previewError("x".repeat(ERROR_PREVIEW_LENGTH + 40));

		expect(preview).toHaveLength(ERROR_PREVIEW_LENGTH);
		expect(preview.endsWith("…")).toBe(true);
	});

	test("sin texto no inventa nada", () => {
		expect(previewError(null)).toBe("");
	});
});

describe("pageWindowOf", () => {
	test("la página 3 de 20 empieza en la fila 40", () => {
		expect(pageWindowOf({ page: 3, pageSize: 20 })).toEqual({
			skip: 40,
			take: 20,
		});
	});
});

describe("validateOperationsList", () => {
	test("acepta una pestaña y un tamaño del selector", () => {
		expect(
			validateOperationsList({ tab: "jobs", page: 2, pageSize: 25 }),
		).toEqual({ tab: "jobs", page: 2, pageSize: 25 });
	});

	test("rechaza una pestaña desconocida, una página cero o un tamaño fuera del selector", () => {
		expect(() =>
			validateOperationsList({ tab: "logs", page: 1, pageSize: 20 }),
		).toThrow();
		expect(() =>
			validateOperationsList({ tab: "emails", page: 0, pageSize: 20 }),
		).toThrow();
		expect(() =>
			validateOperationsList({ tab: "emails", page: 1, pageSize: 1000 }),
		).toThrow();
	});
});
