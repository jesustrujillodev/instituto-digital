import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { resolveErrorMessage } from "@/shared/response/response.messages";
import {
	CHECK_IN_ERROR_CODES,
	CheckInSessionClosedError,
	CheckInSessionNotOpenError,
} from "../../domain/check-in.errors";
import { CHECK_IN_ERROR_MESSAGES } from "../check-in-error-messages";

const WINDOW = {
	opensAt: zonedInputToUtc("2026-09-21", "14:30"),
	closesAt: zonedInputToUtc("2026-09-21", "15:15"),
};

const messageOf = (error: { code: string; details?: Record<string, string> }) =>
	resolveErrorMessage(
		{ code: error.code, message: "", details: error.details },
		CHECK_IN_ERROR_MESSAGES,
	);

// Un instante suelto ("abre a las 14:30") se lee como el único momento válido.
describe("ventana de escaneo", () => {
	test("la sesión aún cerrada anuncia el rango completo y la zona", () => {
		const message = messageOf(new CheckInSessionNotOpenError(WINDOW));

		expect(message).toContain("14:30–15:15");
		expect(message).toContain("hora de Tijuana");
	});

	test("la sesión ya cerrada también dice desde cuándo estuvo abierta", () => {
		const message = messageOf(new CheckInSessionClosedError(WINDOW));

		expect(message).toContain("14:30–15:15");
		expect(message).toContain("quien imparte el curso");
	});

	test("una ventana que cruza la medianoche repite la fecha", () => {
		const message = messageOf(
			new CheckInSessionNotOpenError({
				opensAt: zonedInputToUtc("2026-09-21", "23:45"),
				closesAt: zonedInputToUtc("2026-09-22", "00:15"),
			}),
		);

		expect(message).toContain("23:45");
		expect(message).toContain("00:15");
		expect(message).toContain("22 sep 2026");
	});

	test("sin details utilizables no se inventa un horario", () => {
		const message = messageOf({ code: CHECK_IN_ERROR_CODES.SESSION_NOT_OPEN });

		expect(message).not.toContain("hora de Tijuana");
	});
});
