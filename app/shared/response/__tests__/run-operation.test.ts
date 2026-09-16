import { describe, expect, test } from "vitest";
import { DomainError } from "@/shared/errors/domain-error";
import type { LogData, Logger } from "@/shared/logging/logger";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { ok } from "../response.helpers";
import { createOperationRunner } from "../run-operation";

class KnownError extends DomainError {
	readonly code = "KNOWN";

	constructor() {
		super("Known failure");
	}
}

type Entry = { level: string; message: string; data?: LogData };

const createSpyLogger = () => {
	const entries: Entry[] = [];

	const logger: Logger = {
		debug: (message, data) => entries.push({ level: "debug", message, data }),
		info: (message, data) => entries.push({ level: "info", message, data }),
		warn: (message, data) => entries.push({ level: "warn", message, data }),
		error: (message, data) => entries.push({ level: "error", message, data }),
		child: () => logger,
	};

	return { logger, entries };
};

describe("createOperationRunner", () => {
	test("passes a successful response through untouched", async () => {
		const { logger, entries } = createSpyLogger();
		const run = createOperationRunner(logger);

		const result = await run("list", async () => ok([1, 2, 3]));

		expect(result).toEqual({
			success: true,
			data: [1, 2, 3],
			timestamp: expect.any(String),
		});
		expect(entries).toHaveLength(0);
	});

	// Esta es la razón de ser del runner: el repositorio lanza, pero el contrato
	// del servicio dice que devuelve una respuesta.
	test("turns a thrown domain error into the fail branch", async () => {
		const { logger } = createSpyLogger();
		const run = createOperationRunner(logger);

		const result = await run("archive", async () => {
			throw new KnownError();
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("KNOWN");
			expect(result.error.message).toBe("Known failure");
		}
	});

	test("logs a known failure at debug, with the code only", async () => {
		const { logger, entries } = createSpyLogger();
		const run = createOperationRunner(logger);

		await run("archive", async () => {
			throw new KnownError();
		});

		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe("debug");
		expect(entries[0].data).toEqual({ code: "KNOWN" });
	});

	// El mensaje real es justo lo que NO viaja en la respuesta, así que el log es
	// el único sitio donde queda registrado para depurar.
	test("logs an unknown failure at error, with its real message", async () => {
		const { logger, entries } = createSpyLogger();
		const run = createOperationRunner(logger);

		const result = await run("update", async () => {
			throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe(RESPONSE_ERROR_CODES.UNEXPECTED);
			expect(result.error.message).toBe("Unexpected error");
		}

		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe("error");
		expect(entries[0].message).toBe("unexpected error in update");
		expect(entries[0].data?.message).toBe("connect ECONNREFUSED 10.0.0.5:5432");
	});

	test("lets the operation return a fail branch without throwing", async () => {
		const { logger, entries } = createSpyLogger();
		const run = createOperationRunner(logger);

		const result = await run("findById", async () => ({
			success: false as const,
			error: { code: "NOT_FOUND", message: "gone" },
			timestamp: new Date().toISOString(),
		}));

		expect(result.success).toBe(false);
		expect(entries).toHaveLength(0);
	});
});

describe("createOperationRunner — throws that are not Errors", () => {
	// El stack solo se adjunta si existe. Un `throw "texto"` no tiene ninguno, y
	// el runner debe registrarlo igual en vez de romperse al leer `.stack`.
	test("registra un throw de string sin stack y responde genérico", async () => {
		const { logger, entries } = createSpyLogger();
		const run = createOperationRunner(logger);

		const result = await run("op", async () => {
			throw "algo salió mal";
		});

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.code).toBe("UNEXPECTED_ERROR");
		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe("error");
		expect(entries[0].data?.message).toBe("algo salió mal");
		expect(entries[0].data?.stack).toBeUndefined();
	});
});
