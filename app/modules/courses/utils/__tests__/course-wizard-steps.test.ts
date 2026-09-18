import { describe, expect, test } from "vitest";
import {
	COURSE_WIZARD_STEPS,
	firstPendingStep,
	LAST_STEP_NUMBER,
	parseStepNumber,
	stepOfCheck,
	stepPath,
	stepsWithErrors,
	stepsWithPending,
} from "../course-wizard-steps";

const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("COURSE_WIZARD_STEPS", () => {
	test("los números van de 1 al último sin saltos", () => {
		expect(COURSE_WIZARD_STEPS.map((step) => step.number)).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect(LAST_STEP_NUMBER).toBe(5);
	});

	test("ningún campo vive en dos pasos", () => {
		const fields = COURSE_WIZARD_STEPS.flatMap((step) => step.fields);

		expect(new Set(fields).size).toBe(fields.length);
	});

	test("la revisión no captura campos", () => {
		expect(COURSE_WIZARD_STEPS.at(-1)?.fields).toEqual([]);
	});
});

describe("stepOfCheck", () => {
	test("sesiones y lugares se resuelven en el programa", () => {
		expect(stepOfCheck("sessions")).toBe("program");
		expect(stepOfCheck("places")).toBe("program");
	});

	test("capacitador y audiencia se resuelven en acceso", () => {
		expect(stepOfCheck("trainer")).toBe("access");
		expect(stepOfCheck("audience")).toBe("access");
	});
});

describe("stepsWithPending", () => {
	test("marca solo los pasos de los pendientes", () => {
		const pending = stepsWithPending([
			{ check: "sessions", done: false },
			{ check: "places", done: false },
			{ check: "trainer", done: true },
		]);

		expect(pending).toEqual(new Set(["program"]));
	});

	test("una checklist completa no marca nada", () => {
		expect(
			stepsWithPending([
				{ check: "sessions", done: true },
				{ check: "trainer", done: true },
			]).size,
		).toBe(0);
	});
});

describe("firstPendingStep", () => {
	test("lleva al primer paso con algo pendiente", () => {
		expect(
			firstPendingStep([
				{ check: "sessions", done: true },
				{ check: "places", done: true },
				{ check: "trainer", done: false },
			]),
		).toBe(3);
	});

	test("el programa gana al acceso aunque los dos falten", () => {
		expect(
			firstPendingStep([
				{ check: "trainer", done: false },
				{ check: "sessions", done: false },
			]),
		).toBe(2);
	});

	test("sin pendientes lleva a la revisión", () => {
		expect(firstPendingStep([{ check: "sessions", done: true }])).toBe(
			LAST_STEP_NUMBER,
		);
	});
});

describe("parseStepNumber", () => {
	test("devuelve el paso que nombra el segmento", () => {
		expect(parseStepNumber("3")).toMatchObject({ number: 3, key: "access" });
	});

	test.each(["0", "6", "dos", "", undefined, "1.5"])(
		"%s no nombra ningún paso",
		(raw) => {
			expect(parseStepNumber(raw)).toBeNull();
		},
	);
});

describe("stepPath", () => {
	test("apunta al paso del curso", () => {
		expect(stepPath(COURSE_ID, 2)).toBe(
			`/dashboard/cursos/${COURSE_ID}/nuevo/2`,
		);
	});
});

describe("stepsWithErrors", () => {
	test("marca el paso de cada campo con error", () => {
		expect(stepsWithErrors(["title", "minAttendance"])).toEqual(
			new Set(["identity", "rules"]),
		);
	});

	test("un error anidado cuenta por su campo raíz", () => {
		expect(stepsWithErrors(["sessions.2.venue"])).toEqual(new Set(["program"]));
	});

	test("sin errores no marca nada", () => {
		expect(stepsWithErrors([]).size).toBe(0);
	});
});
