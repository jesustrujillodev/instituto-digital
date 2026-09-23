import { describe, expect, test } from "vitest";
import {
	RATING_ERROR_CODES,
	RatingAlreadyRatedError,
	RatingNotEligibleError,
} from "../rating.errors";
import { toCourseRatingSummary } from "../rating.mapper";
import { canRateCourse } from "../rating.rules";
import { validateRateCourse } from "../rating.validators";

describe("canRateCourse", () => {
	const eligible = {
		courseStatus: "FINISHED" as const,
		courseFormat: "SCHEDULED" as const,
		enrollmentStatus: "ENROLLED" as const,
		attendedSessions: 1,
		completed: false,
	};

	test("valora quien estuvo inscrito y asistió al menos a una sesión", () => {
		expect(canRateCourse(eligible)).toBe(true);
	});

	test("no antes de finalizar, sin asistencia ni tras darse de baja", () => {
		expect(canRateCourse({ ...eligible, courseStatus: "PUBLISHED" })).toBe(
			false,
		);
		expect(canRateCourse({ ...eligible, attendedSessions: 0 })).toBe(false);
		expect(canRateCourse({ ...eligible, enrollmentStatus: "WITHDRAWN" })).toBe(
			false,
		);
		expect(canRateCourse({ ...eligible, enrollmentStatus: null })).toBe(false);
	});

	// docs/adr/0014: no se finaliza ni tiene sesiones; se valora al completarlo.
	test("un autogestivo se valora al completarlo, aunque siga publicado", () => {
		const selfPaced = {
			...eligible,
			courseStatus: "PUBLISHED" as const,
			courseFormat: "SELF_PACED" as const,
			attendedSessions: 0,
		};

		expect(canRateCourse({ ...selfPaced, completed: true })).toBe(true);
		expect(canRateCourse(selfPaced)).toBe(false);
		expect(
			canRateCourse({
				...selfPaced,
				completed: true,
				enrollmentStatus: "WITHDRAWN",
			}),
		).toBe(false);
	});
});

describe("validateRateCourse", () => {
	test("puntuación entera de 1 a 5", () => {
		expect(() => validateRateCourse({ score: 0 })).toThrow();
		expect(() => validateRateCourse({ score: 6 })).toThrow();
		expect(() => validateRateCourse({ score: 4.5 })).toThrow();
		expect(validateRateCourse({ score: 5 })).toEqual({
			score: 5,
			comment: null,
		});
	});

	test("un comentario en blanco se guarda como null", () => {
		expect(validateRateCourse({ score: 3, comment: "   " }).comment).toBeNull();
		expect(validateRateCourse({ score: 3, comment: " Útil " }).comment).toBe(
			"Útil",
		);
	});
});

describe("toCourseRatingSummary", () => {
	test("sin valoraciones el promedio es null, no cero", () => {
		expect(toCourseRatingSummary([])).toEqual({
			average: null,
			count: 0,
			comments: [],
		});
	});

	test("promedia a un decimal y solo lista los comentarios escritos", () => {
		const createdAt = new Date("2026-09-10T00:00:00.000Z");

		expect(
			toCourseRatingSummary([
				{ score: 5, comment: "Muy práctico", createdAt },
				{ score: 4, comment: null, createdAt },
				{ score: 4, comment: null, createdAt },
			]),
		).toEqual({
			average: 4.3,
			count: 3,
			comments: [{ score: 5, comment: "Muy práctico", createdAt }],
		});
	});
});

describe("errores de valoración", () => {
	test("exponen su código estable", () => {
		expect(new RatingAlreadyRatedError().code).toBe(
			RATING_ERROR_CODES.ALREADY_RATED,
		);
		expect(new RatingNotEligibleError().code).toBe(
			RATING_ERROR_CODES.NOT_ELIGIBLE,
		);
	});
});
