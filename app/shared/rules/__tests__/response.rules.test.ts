import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	createOkResponseSchema,
	createResponseSchema,
	failResponseSchema,
	paginationMetaSchema,
	RESPONSE_ERROR_CODES,
	responseErrorSchema,
} from "../response.rules";

const TIMESTAMP = "2026-08-03T12:00:00.000Z";

describe("RESPONSE_ERROR_CODES", () => {
	// Son parte del contrato: cliente y tests distinguen el caso por el codigo, no
	// por el texto de UI. Renombrar uno rompe consumidores, asi que se fija aqui.
	test("keeps its stable values", () => {
		expect(RESPONSE_ERROR_CODES).toEqual({
			VALIDATION: "VALIDATION_ERROR",
			NOT_FOUND: "NOT_FOUND",
			UNAUTHORIZED: "UNAUTHORIZED",
			FORBIDDEN: "FORBIDDEN",
			CONFLICT: "CONFLICT",
			UNEXPECTED: "UNEXPECTED_ERROR",
		});
	});

	// Ningun codigo transversal puede ser un status HTTP: la traduccion a HTTP es
	// del adaptador, y mezclarlas es el antipatron §17.5 de reglas.md.
	test("no code is an HTTP status", () => {
		for (const code of Object.values(RESPONSE_ERROR_CODES)) {
			expect(Number.isNaN(Number(code))).toBe(true);
		}
	});
});

describe("paginationMetaSchema", () => {
	test("requires the four numeric fields", () => {
		const result = v.safeParse(paginationMetaSchema, {
			page: 1,
			pageSize: 10,
			total: 42,
			totalPages: 5,
		});

		expect(result.success).toBe(true);
	});

	test("rejects a meta with a missing field", () => {
		const result = v.safeParse(paginationMetaSchema, {
			page: 1,
			pageSize: 10,
			total: 42,
		});

		expect(result.success).toBe(false);
	});
});

describe("responseErrorSchema", () => {
	test("code and message are required; fieldErrors and details are not", () => {
		expect(
			v.safeParse(responseErrorSchema, { code: "NOT_FOUND", message: "x" })
				.success,
		).toBe(true);
		expect(
			v.safeParse(responseErrorSchema, { code: "NOT_FOUND" }).success,
		).toBe(false);
	});

	test("accepts fieldErrors and details when present", () => {
		const result = v.safeParse(responseErrorSchema, {
			code: "VALIDATION_ERROR",
			message: "x",
			fieldErrors: { email: "Correo inválido" },
			details: { retryAfterMs: 5000 },
		});

		expect(result.success).toBe(true);
	});

	test("fieldErrors must map strings to strings", () => {
		const result = v.safeParse(responseErrorSchema, {
			code: "VALIDATION_ERROR",
			message: "x",
			fieldErrors: { email: 42 },
		});

		expect(result.success).toBe(false);
	});
});

describe("createOkResponseSchema", () => {
	const schema = createOkResponseSchema(v.object({ id: v.number() }));

	test("validates the success branch with its data and timestamp", () => {
		const result = v.safeParse(schema, {
			success: true,
			data: { id: 1 },
			timestamp: TIMESTAMP,
		});

		expect(result.success).toBe(true);
	});

	test("message and pagination are optional", () => {
		const result = v.safeParse(schema, {
			success: true,
			data: { id: 1 },
			message: "Listo",
			pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
			timestamp: TIMESTAMP,
		});

		expect(result.success).toBe(true);
	});

	test("rejects data that does not match the given schema", () => {
		const result = v.safeParse(schema, {
			success: true,
			data: { id: "uno" },
			timestamp: TIMESTAMP,
		});

		expect(result.success).toBe(false);
	});

	// El timestamp lo pone el constructor, no quien llama, pero el esquema lo
	// exige: una respuesta sin el no cumple el contrato §25.1.
	test("timestamp is mandatory", () => {
		const result = v.safeParse(schema, { success: true, data: { id: 1 } });

		expect(result.success).toBe(false);
	});
});

describe("failResponseSchema", () => {
	test("validates the failure branch", () => {
		const result = v.safeParse(failResponseSchema, {
			success: false,
			error: { code: "NOT_FOUND", message: "No existe" },
			timestamp: TIMESTAMP,
		});

		expect(result.success).toBe(true);
	});
});

describe("createResponseSchema", () => {
	const schema = createResponseSchema(v.object({ id: v.number() }));

	test("accepts either branch", () => {
		expect(
			v.safeParse(schema, {
				success: true,
				data: { id: 1 },
				timestamp: TIMESTAMP,
			}).success,
		).toBe(true);
		expect(
			v.safeParse(schema, {
				success: false,
				error: { code: "NOT_FOUND", message: "No existe" },
				timestamp: TIMESTAMP,
			}).success,
		).toBe(true);
	});

	// La razon de usar una union discriminada y no `{ success: boolean }`: los
	// estados imposibles no se pueden ni construir ni validar.
	test("rejects the impossible state success:true with an error", () => {
		const result = v.safeParse(schema, {
			success: true,
			error: { code: "NOT_FOUND", message: "No existe" },
			timestamp: TIMESTAMP,
		});

		expect(result.success).toBe(false);
	});

	test("rejects a success branch carrying no data", () => {
		const result = v.safeParse(schema, { success: true, timestamp: TIMESTAMP });

		expect(result.success).toBe(false);
	});
});
