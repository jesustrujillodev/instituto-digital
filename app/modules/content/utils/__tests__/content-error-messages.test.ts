import { describe, expect, test } from "vitest";
import { fail } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { CONTENT_ERROR_MESSAGES } from "../content-error-messages";

const validation = (fieldErrors?: Record<string, string>) =>
	localizeError(
		fail({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Validation failed",
			...(fieldErrors && { fieldErrors }),
		}),
		CONTENT_ERROR_MESSAGES,
	).error;

describe("mensaje de una validación del temario", () => {
	test("enseña el primer problema concreto, no un aviso genérico", () => {
		expect(
			validation({ title: "Escribe el título del cuestionario." }).message,
		).toBe("Escribe el título del cuestionario.");
	});

	test("en un cuestionario dice de qué pregunta se trata", () => {
		expect(
			validation({
				"questions.2.points": "Una pregunta vale al menos 1 punto.",
			}).message,
		).toBe("Pregunta 3: Una pregunta vale al menos 1 punto.");
	});

	test("conserva el código y los errores por campo", () => {
		const error = validation({ title: "Escribe el título." });

		expect(error.code).toBe(RESPONSE_ERROR_CODES.VALIDATION);
		expect(error.fieldErrors).toEqual({ title: "Escribe el título." });
	});

	test("sin errores por campo cae al aviso general", () => {
		expect(validation().message).toBe(
			"Revisa los datos del temario antes de guardar.",
		);
	});
});
