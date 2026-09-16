import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { DomainError } from "@/shared/errors/domain-error";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	fail,
	isFail,
	isOk,
	ok,
	parseInput,
	toPaginationMeta,
	toResponseError,
} from "../response.helpers";

class TestDomainError extends DomainError {
	readonly code = "TEST_ERROR";
	readonly details = { retryAfterMs: 5000 };

	constructor() {
		super("Something known went wrong");
	}
}

describe("ok", () => {
	test("marks the response as successful and stamps a timestamp", () => {
		const response = ok({ id: 1 });

		expect(response.success).toBe(true);
		expect(response.data).toEqual({ id: 1 });
		expect(() => new Date(response.timestamp).toISOString()).not.toThrow();
	});

	test("omits message and pagination when not provided", () => {
		const response = ok(null);

		expect("message" in response).toBe(false);
		expect("pagination" in response).toBe(false);
	});

	test("carries message and pagination when provided", () => {
		const pagination = toPaginationMeta({ page: 2, pageSize: 10, total: 35 });
		const response = ok([], { message: "Listo", pagination });

		expect(response.message).toBe("Listo");
		expect(response.pagination).toEqual(pagination);
	});
});

describe("isOk / isFail", () => {
	test("discriminate the two branches", () => {
		const success = ok("value");
		const failure = fail({ code: "X", message: "boom" });

		expect(isOk(success)).toBe(true);
		expect(isFail(success)).toBe(false);
		expect(isOk(failure)).toBe(false);
		expect(isFail(failure)).toBe(true);
	});
});

describe("toPaginationMeta", () => {
	test("derives totalPages from total and pageSize", () => {
		expect(toPaginationMeta({ page: 1, pageSize: 10, total: 35 })).toEqual({
			page: 1,
			pageSize: 10,
			total: 35,
			totalPages: 4,
		});
	});

	// Devolver 0 dejaría los controles de la tabla en "página 1 de 0".
	test("keeps at least one page when there are no results", () => {
		expect(
			toPaginationMeta({ page: 1, pageSize: 10, total: 0 }).totalPages,
		).toBe(1);
	});
});

describe("toResponseError", () => {
	test("turns a ValiError into a validation error with fieldErrors", () => {
		const schema = v.object({
			email: v.pipe(v.string(), v.email("Correo inválido")),
		});

		let error: unknown;
		try {
			v.parse(schema, { email: "not-an-email" });
		} catch (caught) {
			error = caught;
		}

		expect(toResponseError(error)).toEqual({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Validation failed",
			fieldErrors: { email: "Correo inválido" },
		});
	});

	test("keeps the code, message and details of a domain error", () => {
		expect(toResponseError(new TestDomainError())).toEqual({
			code: "TEST_ERROR",
			message: "Something known went wrong",
			details: { retryAfterMs: 5000 },
		});
	});

	// Lo importante de este caso: el mensaje original NO viaja. Podría traer una
	// consulta SQL, una ruta del sistema de archivos o un secreto.
	test("hides the message of an unknown error", () => {
		const error = new Error("connect ECONNREFUSED 10.0.0.5:5432");

		expect(toResponseError(error)).toEqual({
			code: RESPONSE_ERROR_CODES.UNEXPECTED,
			message: "Unexpected error",
		});
	});

	test("treats a plain object with a code as unknown", () => {
		// No basta con parecer un error de dominio: hay que extender DomainError.
		expect(toResponseError({ code: "FAKE", message: "spoofed" }).code).toBe(
			RESPONSE_ERROR_CODES.UNEXPECTED,
		);
	});
});

describe("parseInput", () => {
	test("wraps the parsed value on success", () => {
		const result = parseInput(() => ({ documentId: "abc" }));

		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toEqual({ documentId: "abc" });
	});

	test("converts a thrown ValiError into the fail branch", () => {
		const schema = v.object({
			age: v.pipe(v.number(), v.minValue(18, "Muy joven")),
		});

		const result = parseInput(() => v.parse(schema, { age: 12 }));

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(RESPONSE_ERROR_CODES.VALIDATION);
			expect(result.error.fieldErrors).toEqual({ age: "Muy joven" });
		}
	});
});
