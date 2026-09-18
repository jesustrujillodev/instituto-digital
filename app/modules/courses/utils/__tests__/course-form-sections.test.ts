import { describe, expect, test } from "vitest";
import {
	COURSE_FORM_SECTIONS,
	sectionsWithErrors,
} from "../course-form-sections";

describe("sectionsWithErrors", () => {
	test("marca la sección de cada campo con error", () => {
		expect(sectionsWithErrors(["title", "minAttendance"])).toEqual(
			new Set(["general", "attendance"]),
		);
	});

	test("un error anidado cuenta por su campo raíz", () => {
		expect(sectionsWithErrors(["sessions.2.venue"])).toEqual(
			new Set(["program"]),
		);
	});

	test("sin errores no marca nada", () => {
		expect(sectionsWithErrors([]).size).toBe(0);
	});

	test("ningún campo vive en dos secciones", () => {
		const fields = COURSE_FORM_SECTIONS.flatMap((section) => section.fields);

		expect(new Set(fields).size).toBe(fields.length);
	});
});
