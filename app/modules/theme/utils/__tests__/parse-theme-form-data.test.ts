import { describe, expect, test } from "vitest";
import { parseTokensField } from "../parse-theme-form-data";

describe("parseTokensField", () => {
	test("reads the JSON the builder sends", () => {
		expect(parseTokensField('{"shared":{"radius":"1rem"}}')).toEqual({
			shared: { radius: "1rem" },
		});
	});

	// Devolver null y no lanzar es deliberado: quien decide que la entrada es
	// inválida es el validador de frontera, con el mismo `code` que cualquier
	// otro campo mal formado. Un `try` suelto en el adaptador daría otro error
	// para el mismo problema.
	test("returns null for malformed JSON instead of throwing", () => {
		expect(parseTokensField("{no soy json")).toBeNull();
	});

	test("returns null when the field is missing or not a string", () => {
		expect(parseTokensField(null)).toBeNull();
		expect(parseTokensField(new File([], "tema.json"))).toBeNull();
	});
});
