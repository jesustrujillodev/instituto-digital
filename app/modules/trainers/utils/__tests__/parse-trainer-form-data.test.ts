import { describe, expect, test } from "vitest";
import {
	INTENT_FIELD,
	parseTrainerFormData,
	TRAINER_INTENTS,
} from "../parse-trainer-form-data";

const formDataOf = (entries: Record<string, string>) => {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return formData;
};

describe("parseTrainerFormData", () => {
	test("separa la intención de los campos", () => {
		const { fields, intent } = parseTrainerFormData(
			formDataOf({
				specialty: "Protección civil",
				[INTENT_FIELD]: TRAINER_INTENTS.update,
			}),
		);

		expect(intent).toBe(TRAINER_INTENTS.update);
		expect(fields).toEqual({ specialty: "Protección civil" });
	});

	// Un input sin rellenar manda "", y para los campos opcionales del dominio
	// eso no es un valor sino su ausencia.
	test("descarta los campos vacíos", () => {
		const { fields } = parseTrainerFormData(
			formDataOf({ specialty: "Protección civil", bio: "" }),
		);

		expect(fields).toEqual({ specialty: "Protección civil" });
	});

	test("sin intención declarada devuelve null", () => {
		expect(parseTrainerFormData(formDataOf({})).intent).toBeNull();
	});

	test("ignora los valores que no son texto", () => {
		const formData = new FormData();
		formData.append("bio", new File(["x"], "x.txt"));

		expect(parseTrainerFormData(formData).fields).toEqual({});
	});
});
