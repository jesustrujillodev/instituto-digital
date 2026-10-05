import { describe, expect, test } from "vitest";
import type { AccreditationGap } from "@/modules/teaching/domain/teaching.types";
import { ownGapReasonOf } from "../accreditation-reasons";

describe("ownGapReasonOf", () => {
	test.each([
		[
			{ kind: "ATTENDANCE", attended: 1, total: 3, minAttendance: 40 },
			"Asististe a 1 de 3 sesiones y se pedía al menos el 40 %.",
		],
		[
			{ kind: "CONTENT" },
			"No terminaste las lecciones obligatorias del contenido.",
		],
		[{ kind: "EXAM_NOT_TAKEN" }, "No presentaste el examen final."],
		[
			{ kind: "GRADE", grade: 66, minPassingGrade: 70 },
			"Tu calificación fue 66 y la mínima era 70.",
		],
		[{ kind: "GRADE_PENDING" }, "Tu calificación todavía no se calcula."],
	] as [AccreditationGap, string][])("%o", (gap, reason) => {
		expect(ownGapReasonOf(gap)).toBe(reason);
	});
});
