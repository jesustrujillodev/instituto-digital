import { describe, expect, test } from "vitest";
import {
	DEPENDENCY_INTENTS,
	INTENT_FIELD,
	parseDependencyFormData,
} from "../parse-dependency-form-data";

const formDataOf = (entries: Record<string, string>) => {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return formData;
};

describe("parseDependencyFormData", () => {
	test("separa la intención de los campos", () => {
		const parsed = parseDependencyFormData(
			formDataOf({
				name: "Obras Públicas",
				acronym: "SOP",
				[INTENT_FIELD]: DEPENDENCY_INTENTS.create,
			}),
		);

		expect(parsed.intent).toBe("create");
		expect(parsed.fields).toEqual({ name: "Obras Públicas", acronym: "SOP" });
	});

	test("sin intención declarada devuelve null", () => {
		expect(parseDependencyFormData(formDataOf({ name: "Obras" })).intent).toBe(
			null,
		);
	});

	// Un <input> sin rellenar manda "", y para un campo opcional del dominio "" no
	// es un valor válido sino su ausencia: dejarlo pasar guardaría siglas vacías en
	// vez de ninguna.
	test("descarta los campos vacíos", () => {
		const parsed = parseDependencyFormData(
			formDataOf({ name: "Obras Públicas", acronym: "" }),
		);

		expect(parsed.fields).toEqual({ name: "Obras Públicas" });
		expect(parsed.fields).not.toHaveProperty("acronym");
	});

	// Guarda de ejecución: pese al tipo declarado, un envío multipart puede traer
	// File en cualquier clave y valibot lo rechazaría al validar el DTO.
	test("ignora las entradas que no son texto", () => {
		const formData = formDataOf({ name: "Obras Públicas" });
		formData.append("adjunto", new File(["x"], "x.png", { type: "image/png" }));

		expect(parseDependencyFormData(formData).fields).toEqual({
			name: "Obras Públicas",
		});
	});

	test("un envío vacío no produce campos", () => {
		expect(parseDependencyFormData(new FormData())).toEqual({
			fields: {},
			intent: null,
		});
	});
});

describe("DEPENDENCY_INTENTS", () => {
	// Son contrato entre el formulario y el action: el switch del action compara
	// contra estos valores exactos.
	test("declara las cinco intenciones del módulo", () => {
		expect(DEPENDENCY_INTENTS).toEqual({
			create: "create",
			update: "update",
			archive: "archive",
			unarchive: "unarchive",
			assignHead: "assign-head",
		});
	});
});
