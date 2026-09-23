import { describe, expect, test } from "vitest";
import {
	COURSE_WIZARD_STEPS,
	firstPendingStep,
	LAST_STEP_NUMBER,
	nextStep,
	parseStepNumber,
	previousStep,
	stepOfCheck,
	stepOfKey,
	stepPath,
	stepPosition,
	stepsFor,
	stepsWithErrors,
	stepsWithPending,
} from "../course-wizard-steps";

const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("COURSE_WIZARD_STEPS", () => {
	test("los números van de 1 al último sin saltos", () => {
		expect(COURSE_WIZARD_STEPS.map((step) => step.number)).toEqual([
			1, 2, 3, 4, 5, 6,
		]);
		expect(LAST_STEP_NUMBER).toBe(6);
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

	test("el temario se resuelve en su propio paso", () => {
		expect(stepOfCheck("content")).toBe("content");
	});
});

const SCHEDULED = {
	format: "SCHEDULED",
	completionRule: "ATTENDANCE",
} as const;
const SELF_PACED = { format: "SELF_PACED", completionRule: "CONTENT" } as const;

describe("stepsFor", () => {
	test("un calendarizado salta del 4 al 6: no ve el contenido", () => {
		expect(stepsFor(SCHEDULED).map((step) => step.number)).toEqual([
			1, 2, 3, 4, 6,
		]);
	});

	test("un autogestivo los recorre todos", () => {
		expect(stepsFor(SELF_PACED).map((step) => step.number)).toEqual([
			1, 2, 3, 4, 5, 6,
		]);
	});

	// El número es la URL; la posición es lo que se enseña. Un curso con sesiones
	// lee "Paso 5 de 5" en la revisión aunque viva en /nuevo/6.
	test("la posición visible no es el número del paso", () => {
		const steps = stepsFor(SCHEDULED);

		expect(stepPosition(steps, stepOfKey("review"))).toEqual({
			position: 5,
			total: 5,
		});
	});

	test("el siguiente y el anterior saltan el paso que no aplica", () => {
		const steps = stepsFor(SCHEDULED);

		expect(nextStep(steps, stepOfKey("rules"))).toBe(stepOfKey("review"));
		expect(previousStep(steps, stepOfKey("review"))).toBe(stepOfKey("rules"));
		expect(nextStep(steps, stepOfKey("review"))).toBeNull();
		expect(previousStep(steps, stepOfKey("identity"))).toBeNull();
	});

	test("un calendarizado que también se completa por contenido ve su temario", () => {
		expect(
			stepsFor({ format: "SCHEDULED", completionRule: "BOTH" }).map(
				(step) => step.number,
			),
		).toEqual([1, 2, 3, 4, 5, 6]);
	});

	test("en un autogestivo el contenido va entre reglas y revisión", () => {
		const steps = stepsFor(SELF_PACED);

		expect(nextStep(steps, stepOfKey("rules"))).toBe(stepOfKey("content"));
		expect(nextStep(steps, stepOfKey("content"))).toBe(stepOfKey("review"));
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
			firstPendingStep(
				[
					{ check: "sessions", done: true },
					{ check: "places", done: true },
					{ check: "trainer", done: false },
				],
				SCHEDULED,
			),
		).toBe(3);
	});

	test("el programa gana al acceso aunque los dos falten", () => {
		expect(
			firstPendingStep(
				[
					{ check: "trainer", done: false },
					{ check: "sessions", done: false },
				],
				SCHEDULED,
			),
		).toBe(2);
	});

	test("sin pendientes lleva a la revisión", () => {
		expect(
			firstPendingStep([{ check: "sessions", done: true }], SCHEDULED),
		).toBe(LAST_STEP_NUMBER);
	});

	test("el pendiente de contenido lleva a su paso", () => {
		expect(
			firstPendingStep(
				[
					{ check: "trainer", done: true },
					{ check: "content", done: false },
				],
				SELF_PACED,
			),
		).toBe(stepOfKey("content").number);
	});
});

describe("parseStepNumber", () => {
	test("devuelve el paso que nombra el segmento", () => {
		expect(parseStepNumber("3")).toMatchObject({ number: 3, key: "access" });
	});

	test.each(["0", "7", "dos", "", undefined, "1.5"])(
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
