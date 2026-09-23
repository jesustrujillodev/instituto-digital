import { describe, expect, test } from "vitest";
import {
	COURSE_WIZARD_STEPS,
	editReturnPath,
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

	test("el capacitador se resuelve en el programa, junto a las sesiones", () => {
		expect(stepOfCheck("trainer")).toBe("program");
	});

	test("la audiencia se resuelve en la inscripción", () => {
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
	test("un calendarizado salta del 2 al 4: no ve el contenido", () => {
		expect(stepsFor(SCHEDULED).map((step) => step.number)).toEqual([
			1, 2, 4, 5, 6,
		]);
	});

	test("el orden es el de llenado: qué, cuándo, cómo y quién entra", () => {
		expect(COURSE_WIZARD_STEPS.map((step) => step.key)).toEqual([
			"identity",
			"program",
			"content",
			"rules",
			"access",
			"review",
		]);
	});

	test("la edición recorre los mismos pasos, sin revisión", () => {
		expect(stepsFor(SCHEDULED, "edit").map((step) => step.key)).toEqual([
			"identity",
			"program",
			"rules",
			"access",
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

		expect(nextStep(steps, stepOfKey("program"))).toBe(stepOfKey("rules"));
		expect(previousStep(steps, stepOfKey("rules"))).toBe(stepOfKey("program"));
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

	test("en un autogestivo el contenido va entre programa y evaluación", () => {
		const steps = stepsFor(SELF_PACED);

		expect(nextStep(steps, stepOfKey("program"))).toBe(stepOfKey("content"));
		expect(nextStep(steps, stepOfKey("content"))).toBe(stepOfKey("rules"));
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
					{ check: "trainer", done: true },
					{ check: "audience", done: false },
				],
				SCHEDULED,
			),
		).toBe(5);
	});

	test("el programa gana a la inscripción aunque los dos falten", () => {
		expect(
			firstPendingStep(
				[
					{ check: "audience", done: false },
					{ check: "trainer", done: false },
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
		expect(parseStepNumber("5")).toMatchObject({ number: 5, key: "access" });
	});

	test.each(["0", "7", "dos", "", undefined, "1.5"])(
		"%s no nombra ningún paso",
		(raw) => {
			expect(parseStepNumber(raw)).toBeNull();
		},
	);
});

describe("stepPath", () => {
	test("apunta al paso del alta", () => {
		expect(stepPath(COURSE_ID, 2)).toBe(
			`/dashboard/cursos/${COURSE_ID}/nuevo/2`,
		);
	});

	test("la edición tiene su propia ruta", () => {
		expect(stepPath(COURSE_ID, 4, "edit")).toBe(
			`/dashboard/cursos/${COURSE_ID}/editar/4`,
		);
	});
});

describe("editReturnPath", () => {
	test("vuelve a la impartición si de ahí se entró", () => {
		expect(editReturnPath(COURSE_ID, "imparticion")).toBe(
			`/dashboard/imparticion/${COURSE_ID}`,
		);
	});

	test.each([null, "https://otro.sitio", "/dashboard/usuarios"])(
		"%s vuelve a la ficha, nunca a una dirección arbitraria",
		(returnTo) => {
			expect(editReturnPath(COURSE_ID, returnTo)).toBe(
				`/dashboard/cursos/${COURSE_ID}`,
			);
		},
	);
});

describe("stepsWithErrors", () => {
	test("marca el paso de cada campo con error", () => {
		expect(stepsWithErrors(["title", "minAttendance", "trainers"])).toEqual(
			new Set(["identity", "rules", "program"]),
		);
	});

	test("un error anidado cuenta por su campo raíz", () => {
		expect(stepsWithErrors(["sessions.2.venue"])).toEqual(new Set(["program"]));
	});

	test("sin errores no marca nada", () => {
		expect(stepsWithErrors([]).size).toBe(0);
	});
});
