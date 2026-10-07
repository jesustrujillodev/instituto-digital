import { describe, expect, test } from "vitest";
import type { LogData, Logger } from "../logger";
import { createThrottledLog } from "../throttled-log";

const createRecorder = () => {
	const entries: { level: string; message: string; data?: LogData }[] = [];
	const logger = {
		warn: (message: string, data?: LogData) =>
			entries.push({ level: "warn", message, data }),
		error: (message: string, data?: LogData) =>
			entries.push({ level: "error", message, data }),
	} as unknown as Logger;
	return { logger, entries };
};

describe("createThrottledLog", () => {
	test("escribe una sola vez por intervalo", () => {
		const { logger, entries } = createRecorder();
		let now = 0;
		const log = createThrottledLog(logger, {
			intervalMs: 10_000,
			now: () => now,
		});

		log.warn("redis", "redis unavailable", { message: "ECONNREFUSED" });
		now = 5_000;
		log.warn("redis", "redis unavailable", { message: "ECONNREFUSED" });

		expect(entries).toEqual([
			{
				level: "warn",
				message: "redis unavailable",
				data: { message: "ECONNREFUSED" },
			},
		]);
	});

	test("al abrirse el siguiente intervalo cuenta lo que calló", () => {
		const { logger, entries } = createRecorder();
		let now = 0;
		const log = createThrottledLog(logger, {
			intervalMs: 10_000,
			now: () => now,
		});

		log.error("redis", "falla");
		log.error("redis", "falla");
		log.error("redis", "falla");
		now = 10_000;
		log.error("redis", "falla");

		expect(entries).toHaveLength(2);
		expect(entries[1]).toEqual({
			level: "error",
			message: "falla",
			data: { suppressed: 2 },
		});
	});

	test("cada clave tiene su propio intervalo", () => {
		const { logger, entries } = createRecorder();
		const log = createThrottledLog(logger, {
			intervalMs: 10_000,
			now: () => 0,
		});

		log.warn("redis:command", "a");
		log.warn("redis:subscriber", "b");

		expect(entries.map((entry) => entry.message)).toEqual(["a", "b"]);
	});
});
