import { describe, expect, test } from "vitest";
import {
	COURSE_INTENTS,
	COVER_FIELD,
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

describe("la portada", () => {
	const fileOf = (bytes: number, name = "portada.webp") =>
		new File([new Uint8Array(bytes)], name, { type: "image/webp" });

	test("sale por su campo y no contamina los de texto", () => {
		// `Object.fromEntries(formData)` metería el File como si fuera un campo y
		// valibot lo rechazaría con un mensaje incomprensible.
		const formData = new FormData();
		formData.append(INTENT_FIELD, COURSE_INTENTS.update);
		formData.append(PAYLOAD_FIELD, JSON.stringify({ title: "Ofimática" }));
		formData.append(COVER_FIELD, fileOf(128));

		const parsed = parseCourseFormData(formData);

		expect(parsed.cover).toBeInstanceOf(File);
		expect(parsed.cover?.name).toBe("portada.webp");
		expect(parsed.fields).not.toHaveProperty(COVER_FIELD);
		expect(parsed.payload).toEqual({ title: "Ofimática" });
	});

	test("un input de archivo enviado sin selección no es una portada", () => {
		const formData = new FormData();
		formData.append(COVER_FIELD, fileOf(0, ""));

		expect(parseCourseFormData(formData).cover).toBeNull();
	});

	test("sin campo de portada, es null y el guardado la conserva", () => {
		expect(parseCourseFormData(formDataOf({})).cover).toBeNull();
	});
});
