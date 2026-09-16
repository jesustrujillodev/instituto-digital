import { describe, expect, test } from "vitest";
import {
	COURSE_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	parseCourseFormData,
} from "../parse-course-form-data";

const formDataOf = (entries: Record<string, string>) => {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return formData;
};

describe("parseCourseFormData", () => {
	// Un solo JSON conserva números, booleanos y colecciones anidadas: con un
	// campo por clave, el servidor tendría que saber a mano qué es cada cosa.
	test("decodifica el curso conservando tipos y colecciones", () => {
		const course = {
			title: "Ofimática",
			capacity: 20,
			requiresEvaluation: true,
			sessions: [{ date: "2026-10-05", startTime: "09:00", endTime: "13:00" }],
		};

		const parsed = parseCourseFormData(
			formDataOf({
				[INTENT_FIELD]: COURSE_INTENTS.create,
				[PAYLOAD_FIELD]: JSON.stringify(course),
			}),
		);

		expect(parsed.intent).toBe(COURSE_INTENTS.create);
		expect(parsed.payload).toEqual(course);
	});

	test("un JSON roto no revienta: llega como null y lo rechaza la regla", () => {
		expect(
			parseCourseFormData(formDataOf({ [PAYLOAD_FIELD]: "{roto" })).payload,
		).toBeNull();
	});

	test("sin payload, el resto de campos sigue disponible", () => {
		const parsed = parseCourseFormData(
			formDataOf({ documentId: "abc", [INTENT_FIELD]: COURSE_INTENTS.cancel }),
		);

		expect(parsed.payload).toBeNull();
		expect(parsed.fields).toEqual({ documentId: "abc" });
	});

	test("descarta los campos vacíos", () => {
		expect(parseCourseFormData(formDataOf({ search: "" })).fields).toEqual({});
	});
});
