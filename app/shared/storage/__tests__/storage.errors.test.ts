import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	STORAGE_ERROR_CODES,
	StorageBatchError,
	StorageObjectLockedError,
	StorageValidationError,
} from "../storage.errors";

describe("STORAGE_ERROR_CODES", () => {
	test("keeps its stable values", () => {
		expect(STORAGE_ERROR_CODES).toEqual({
			VALIDATION: "STORAGE_VALIDATION",
			BATCH_FAILED: "STORAGE_BATCH_FAILED",
			OBJECT_LOCKED: "STORAGE_OBJECT_LOCKED",
		});
	});
});

describe("StorageValidationError", () => {
	const reasons = [
		{ name: "foto.exe", reason: "tipo no permitido: application/x-msdownload" },
		{ name: "enorme.png", reason: "supera el máximo de 5000 bytes" },
	];

	test("carries the stable code", () => {
		expect(new StorageValidationError(reasons).code).toBe("STORAGE_VALIDATION");
	});

	// `details` es lo que el adaptador de entrada necesita para redactar el mensaje
	// de usuario ("no se pudo subir foto.exe porque…"), así que debe ser
	// serializable y viajar dentro del envelope.
	test("exposes the reasons as serialisable details", () => {
		const error = new StorageValidationError(reasons);

		expect(error.details).toEqual({ reasons });
		expect(JSON.parse(JSON.stringify(error.details))).toEqual({ reasons });
	});

	test("aggregates every reason into the technical message", () => {
		const error = new StorageValidationError(reasons);

		expect(error.message).toContain("foto.exe");
		expect(error.message).toContain("enorme.png");
	});

	test("keeps the reasons reachable as a property too", () => {
		expect(new StorageValidationError(reasons).reasons).toEqual(reasons);
	});

	// Si no extendiera DomainError, `toResponseError` lo trataría como
	// desconocido y su mensaje no llegaría al usuario — se respondería genérico.
	test("is a DomainError, so its code and message may travel", () => {
		const error = new StorageValidationError(reasons);

		expect(isDomainError(error)).toBe(true);
		expect(error.name).toBe("StorageValidationError");
	});
});

describe("StorageBatchError", () => {
	const failures = [
		{ name: "foto1.png", error: "Error: timeout" },
		{ name: "foto3.png", error: "Error: 503" },
	];

	test("carries the stable code and its details", () => {
		const error = new StorageBatchError(failures);

		expect(error.code).toBe("STORAGE_BATCH_FAILED");
		expect(error.details).toEqual({ failures });
	});

	test("lists the failed names in the technical message", () => {
		const error = new StorageBatchError(failures);

		expect(error.message).toContain("foto1.png");
		expect(error.message).toContain("foto3.png");
	});

	test("is a DomainError", () => {
		expect(isDomainError(new StorageBatchError(failures))).toBe(true);
		expect(new StorageBatchError(failures).name).toBe("StorageBatchError");
	});

	test("handles an empty list without breaking", () => {
		expect(new StorageBatchError([]).details).toEqual({ failures: [] });
	});
});

describe("StorageObjectLockedError", () => {
	test("carries the stable code and the locked keys as details", () => {
		const error = new StorageObjectLockedError(["documentos/firmas/c/a.png"]);

		expect(isDomainError(error)).toBe(true);
		expect(error.code).toBe("STORAGE_OBJECT_LOCKED");
		expect(error.details).toEqual({ keys: ["documentos/firmas/c/a.png"] });
	});
});
