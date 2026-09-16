import { describe, expect, test } from "vitest";
import { fail } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { COURSE_ERROR_CODES } from "../../domain/course.errors";
import { COURSE_ERROR_MESSAGES } from "../course-error-messages";

describe("COURSE_ERROR_MESSAGES", () => {
	// Añadir un código sin copia dejaría al usuario con el texto genérico.
	test("todo código del módulo tiene copia", () => {
		for (const code of Object.values(COURSE_ERROR_CODES)) {
			expect(COURSE_ERROR_MESSAGES[code]).toBeDefined();
		}
	});

	test("tiene entrada de reserva para lo inesperado", () => {
		expect(
			COURSE_ERROR_MESSAGES[RESPONSE_ERROR_CODES.UNEXPECTED],
		).toBeDefined();
	});

	// El número de sesión es lo único accionable: sin él, el usuario revisaría
	// las sesiones una por una.
	test("dice qué sesión se quedó sin sede", () => {
		const localized = localizeError(
			fail({
				code: COURSE_ERROR_CODES.SESSION_MISSING_VENUE,
				message: "technical",
				details: { sessionNumber: 3 },
			}),
			COURSE_ERROR_MESSAGES,
		);

		expect(localized.error.message).toContain("sesión 3");
	});

	test("la fecha límite fuera de rango se pinta en su campo", () => {
		const localized = localizeError(
			fail({
				code: COURSE_ERROR_CODES.DEADLINE_AFTER_START,
				message: "technical",
			}),
			COURSE_ERROR_MESSAGES,
		);

		expect(localized.error.fieldErrors).toHaveProperty("enrollmentDeadline");
	});
});
