import { describe, expect, test } from "vitest";
import {
	type AccreditationInput,
	accreditationStepsOf,
	gradedPartsOf,
	listOf,
} from "../accreditation";

const input = (
	overrides: Partial<AccreditationInput> = {},
): AccreditationInput => ({
	scheduled: true,
	completionRule: "ATTENDANCE",
	minAttendance: 80,
	requiresEvaluation: false,
	minPassingGrade: 70,
	requiredLessons: null,
	moduleEvaluations: 0,
	countedFollowUps: 0,
	...overrides,
});

describe("accreditationStepsOf", () => {
	test("solo por asistencia, sin nada que califique", () => {
		expect(accreditationStepsOf(input())).toEqual([
			"Asistir al menos al 80 % de las sesiones.",
		]);
	});

	// docs/adr/0024: la calificación compensa, así que el examen se presenta.
	test("con examen final pide presentarlo y el promedio", () => {
		expect(accreditationStepsOf(input({ requiresEvaluation: true }))).toEqual([
			"Asistir al menos al 80 % de las sesiones.",
			"Presentar el examen final.",
			"Tener una calificación de la capacitación de 70 % o más (promedio del examen final).",
		]);
	});

	test("un autogestivo no pide asistencia y cuenta sus lecciones", () => {
		expect(
			accreditationStepsOf(
				input({
					scheduled: false,
					completionRule: "CONTENT",
					requiredLessons: 4,
					moduleEvaluations: 1,
				}),
			),
		).toEqual([
			"Terminar las 4 lecciones obligatorias y presentar las evaluaciones de cada módulo.",
			"Tener una calificación de la capacitación de 70 % o más (promedio de las evaluaciones del temario).",
		]);
	});

	// docs/adr/0027: el seguimiento que cuenta también califica.
	test("el seguimiento que cuenta entra al promedio", () => {
		expect(accreditationStepsOf(input({ countedFollowUps: 2 })).at(-1)).toBe(
			"Tener una calificación de la capacitación de 70 % o más (promedio de las evaluaciones de seguimiento que cuentan).",
		);
	});
});

describe("gradedPartsOf y listOf", () => {
	test("lista las partes del promedio en orden", () => {
		const parts = gradedPartsOf(
			input({
				requiresEvaluation: true,
				completionRule: "BOTH",
				countedFollowUps: 1,
			}),
		);

		expect(listOf(parts)).toBe(
			"el examen final, las evaluaciones del temario y las evaluaciones de seguimiento que cuentan",
		);
		expect(listOf([])).toBe("");
		expect(listOf(["a"])).toBe("a");
	});
});
