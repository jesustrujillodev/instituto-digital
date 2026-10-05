import { describe, expect, test } from "vitest";
import type { AccreditationGap } from "../../domain/teaching.types";
import { gapReasonOf, requirementsOf } from "../accreditation-labels";

const BOTH = {
	completionRule: "BOTH" as const,
	minAttendance: 40,
	minPassingGrade: 70,
};

const ANA = {
	attendancePercent: 66,
	progressPercent: 100,
	grade: 66,
	gaps: [
		{ kind: "GRADE", grade: 66, minPassingGrade: 70 },
	] as AccreditationGap[],
};

describe("requirementsOf", () => {
	test("cada requisito lleva el valor de la persona junto a su mínimo", () => {
		expect(requirementsOf(BOTH, ANA, true)).toEqual([
			{
				key: "attendance",
				label: "Asistencia 66 % (mínimo 40 %)",
				state: "met",
			},
			{ key: "content", label: "Contenido 100 %", state: "met" },
			{
				key: "grade",
				label: "Calificación 66 (mínima 70)",
				state: "unmet",
			},
		]);
	});

	test("solo pide lo que cuenta la regla del curso", () => {
		expect(
			requirementsOf({ ...BOTH, completionRule: "ATTENDANCE" }, ANA, false).map(
				(requirement) => requirement.key,
			),
		).toEqual(["attendance"]);
	});

	test("sin nota todavía, la calificación queda pendiente", () => {
		expect(
			requirementsOf(BOTH, { ...ANA, grade: null, gaps: [] }, true).at(-1),
		).toEqual({
			key: "grade",
			label: "Calificación pendiente (mínima 70)",
			state: "pending",
		});
	});

	test("cerró sin examen: lo dice en lugar de una nota", () => {
		expect(
			requirementsOf(
				BOTH,
				{ ...ANA, grade: null, gaps: [{ kind: "EXAM_NOT_TAKEN" }] },
				true,
			).at(-1),
		).toEqual({
			key: "grade",
			label: "Examen final sin presentar",
			state: "unmet",
		});
	});

	test("la asistencia que no alcanza se marca", () => {
		expect(
			requirementsOf(
				BOTH,
				{
					...ANA,
					attendancePercent: 33,
					gaps: [
						{ kind: "ATTENDANCE", attended: 1, total: 3, minAttendance: 40 },
					],
				},
				true,
			)[0]?.state,
		).toBe("unmet");
	});
});

describe("gapReasonOf", () => {
	test.each([
		[
			{ kind: "ATTENDANCE", attended: 1, total: 3, minAttendance: 40 },
			"Asistió a 1 de 3 sesiones; se pide al menos el 40 %.",
		],
		[
			{ kind: "CONTENT" },
			"Le falta terminar las lecciones obligatorias del contenido.",
		],
		[{ kind: "EXAM_NOT_TAKEN" }, "No presentó el examen final."],
		[
			{ kind: "GRADE", grade: 66, minPassingGrade: 70 },
			"Su calificación es 66; se pide 70 o más.",
		],
		[{ kind: "GRADE_PENDING" }, "Su calificación todavía no se calcula."],
	] as [AccreditationGap, string][])("%o", (gap, reason) => {
		expect(gapReasonOf(gap)).toBe(reason);
	});
});
