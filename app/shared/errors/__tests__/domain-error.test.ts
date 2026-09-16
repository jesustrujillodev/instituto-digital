import { describe, expect, test } from "vitest";
import { DomainError, isDomainError } from "../domain-error";

class SampleDomainError extends DomainError {
	readonly code = "SAMPLE_ERROR";
	readonly details = { retryAfterMs: 5000 };

	constructor() {
		super("Algo conocido salió mal");
	}
}

describe("DomainError", () => {
	// `name` sale de la subclase vía new.target, no de la base: es lo que hace
	// legible un stack trace sin repetir el nombre en cada constructor.
	test("takes its name from the concrete subclass", () => {
		expect(new SampleDomainError().name).toBe("SampleDomainError");
	});

	test("is a real Error and keeps its message and stack", () => {
		const error = new SampleDomainError();

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("Algo conocido salió mal");
		expect(error.stack).toBeDefined();
	});

	test("carries the code and the serialisable details", () => {
		const error = new SampleDomainError();

		expect(error.code).toBe("SAMPLE_ERROR");
		expect(error.details).toEqual({ retryAfterMs: 5000 });
	});
});

describe("isDomainError", () => {
	test("recognises a subclass", () => {
		expect(isDomainError(new SampleDomainError())).toBe(true);
	});

	// LA invariante de seguridad que justifica la clase base. Un errno de Node
	// también tiene `code`: si la comprobación fuera `typeof error.code ===
	// "string"`, el mensaje de un ENOENT —con su ruta del sistema de archivos—
	// viajaría al cliente como si fuera un error de negocio.
	test("rejects a Node error that merely has a `code`", () => {
		const nodeError = Object.assign(
			new Error("connect ECONNREFUSED 10.0.0.5:5432"),
			{ code: "ECONNREFUSED" },
		);

		expect(isDomainError(nodeError)).toBe(false);
	});

	test("rejects a plain object shaped like a domain error", () => {
		expect(isDomainError({ code: "USER_NOT_FOUND", message: "no está" })).toBe(
			false,
		);
	});

	test("rejects a bare Error, null, undefined and primitives", () => {
		expect(isDomainError(new Error("boom"))).toBe(false);
		expect(isDomainError(null)).toBe(false);
		expect(isDomainError(undefined)).toBe(false);
		expect(isDomainError("USER_NOT_FOUND")).toBe(false);
	});
});
