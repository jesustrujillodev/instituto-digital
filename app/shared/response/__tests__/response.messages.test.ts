import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { fail } from "../response.helpers";
import {
	DEFAULT_ERROR_MESSAGE,
	type ErrorMessageMap,
	failFrom,
	localizeError,
	resolveErrorCopy,
} from "../response.messages";

const MESSAGES: ErrorMessageMap = {
	NOT_ARCHIVED: "Archiva el usuario antes de eliminarlo.",
	DUPLICATE_EMAIL: {
		message: "Ese correo ya está registrado.",
		status: 409,
		fieldErrors: { email: "Ese correo ya está registrado" },
	},
	TOO_MANY_ATTEMPTS: {
		message: (error) => `Espera ${error.details?.retryAfterMs} ms.`,
	},
	[RESPONSE_ERROR_CODES.UNEXPECTED]: "Algo salió mal.",
};

describe("localizeError", () => {
	test("replaces the technical message with the module copy", () => {
		const result = localizeError(
			fail({ code: "NOT_ARCHIVED", message: "User must be archived" }),
			MESSAGES,
		);

		expect(result.error.message).toBe(
			"Archiva el usuario antes de eliminarlo.",
		);
	});

	// El código es lo que permite al cliente y a los tests distinguir el caso sin
	// comparar strings de UI traducibles.
	test("never rewrites the code", () => {
		const result = localizeError(
			fail({ code: "NOT_ARCHIVED", message: "User must be archived" }),
			MESSAGES,
		);

		expect(result.error.code).toBe("NOT_ARCHIVED");
	});

	test("adds the fieldErrors declared in the dictionary", () => {
		const result = localizeError(
			fail({ code: "DUPLICATE_EMAIL", message: "Email already registered" }),
			MESSAGES,
		);

		expect(result.error.fieldErrors).toEqual({
			email: "Ese correo ya está registrado",
		});
	});

	// Los de una validación son más concretos que los genéricos del diccionario.
	test("keeps the fieldErrors the error already carried", () => {
		const result = localizeError(
			fail({
				code: "DUPLICATE_EMAIL",
				message: "Email already registered",
				fieldErrors: { email: "Ya existe una cuenta con ese correo" },
			}),
			MESSAGES,
		);

		expect(result.error.fieldErrors).toEqual({
			email: "Ya existe una cuenta con ese correo",
		});
	});

	test("interpolates details when the copy is a function", () => {
		const result = localizeError(
			fail({
				code: "TOO_MANY_ATTEMPTS",
				message: "Too many attempts",
				details: { retryAfterMs: 30000 },
			}),
			MESSAGES,
		);

		expect(result.error.message).toBe("Espera 30000 ms.");
	});

	test("falls back to the module's UNEXPECTED copy for unknown codes", () => {
		const result = localizeError(
			fail({ code: "SOME_CODE_NOBODY_MAPPED", message: "internal detail" }),
			MESSAGES,
		);

		expect(result.error.message).toBe("Algo salió mal.");
	});

	test("falls back to the global default when the dictionary is empty", () => {
		const result = localizeError(fail({ code: "X", message: "raw" }), {});

		expect(result.error.message).toBe(DEFAULT_ERROR_MESSAGE);
	});
});

describe("resolveErrorCopy", () => {
	test("exposes the status so loaders can cut with the right one", () => {
		const copy = resolveErrorCopy(
			{ code: "DUPLICATE_EMAIL", message: "Email already registered" },
			MESSAGES,
		);

		expect(copy.status).toBe(409);
	});

	test("has no status for codes that only make sense in an action", () => {
		const copy = resolveErrorCopy(
			{ code: "NOT_ARCHIVED", message: "User must be archived" },
			MESSAGES,
		);

		expect(copy.status).toBeUndefined();
	});
});

describe("failFrom", () => {
	// Atajo para el error que aún se captura en la FRONTERA: la validación del
	// propio adaptador (params de la URL, campos del FormData), que ocurre antes
	// de llamar al servicio y por tanto no pasa por el runner.
	test("convierte un ValiError en la rama de fallo ya localizada", () => {
		const schema = v.object({ email: v.pipe(v.string(), v.email()) });
		const thrown = (() => {
			try {
				v.parse(schema, { email: "ana" });
			} catch (error) {
				return error;
			}
		})();

		const result = failFrom(thrown, {
			VALIDATION_ERROR: "Revisa los datos del formulario.",
		});

		expect(result.success).toBe(false);
		expect(result.error.code).toBe("VALIDATION_ERROR");
		expect(result.error.message).toBe("Revisa los datos del formulario.");
		expect(result.error.fieldErrors?.email).toBeDefined();
	});

	// Un error sin tipar sale genérico: su mensaje podría traer SQL, rutas del
	// sistema de archivos o un secreto.
	test("un error desconocido sale genérico, sin su mensaje real", () => {
		const result = failFrom(
			new Error("connect ECONNREFUSED 10.0.0.5:5432"),
			{},
		);

		expect(result.error.code).toBe("UNEXPECTED_ERROR");
		expect(result.error.message).not.toContain("ECONNREFUSED");
	});

	test("usa la copia del módulo para el código de reserva", () => {
		const result = failFrom(new Error("boom"), {
			UNEXPECTED_ERROR: "Algo salió mal en usuarios.",
		});

		expect(result.error.message).toBe("Algo salió mal en usuarios.");
	});
});
