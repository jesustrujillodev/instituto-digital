import { describe, expect, test } from "vitest";
import {
	GROUP_INTENTS,
	INTENT_FIELD,
	parseGroupFormData,
} from "../parse-group-form-data";

describe("parseGroupFormData", () => {
	test("separa la intención de los campos", () => {
		const body = new FormData();
		body.append("name", "Mandos medios");
		body.append(INTENT_FIELD, GROUP_INTENTS.update);

		const { fields, intent } = parseGroupFormData(body);

		expect(intent).toBe(GROUP_INTENTS.update);
		expect(fields).toEqual({ name: "Mandos medios" });
	});

	// Es lo que distingue a este parser del de los demás módulos: el alta de
	// miembros manda varios `userDocumentIds` en el mismo envío, y quedarse con
	// el último dejaría el grupo con un solo miembro sin avisar.
	test("conserva TODAS las claves repetidas", () => {
		const body = new FormData();
		body.append("userDocumentIds", "a");
		body.append("userDocumentIds", "b");
		body.append("userDocumentIds", "c");

		expect(parseGroupFormData(body).lists.userDocumentIds).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	test("descarta los campos vacíos", () => {
		const body = new FormData();
		body.append("name", "Mandos medios");
		body.append("description", "");

		expect(parseGroupFormData(body).fields).toEqual({ name: "Mandos medios" });
	});

	test("ignora los valores que no son texto", () => {
		const body = new FormData();
		body.append("description", new File(["x"], "x.txt"));

		expect(parseGroupFormData(body).fields).toEqual({});
	});
});
