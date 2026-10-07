import { describe, expect, test } from "vitest";
import type { ThrottledLog } from "../../logging/throttled-log";
import type { RateLimiter } from "../rate-limiter";
import { createFallbackRateLimiter } from "../rate-limiter.fallback";

const OPTS = { limit: 3, windowMs: 60_000 };

const createHarness = (primaryFails: boolean) => {
	const calls = { primary: 0, fallback: 0, warnings: [] as string[] };
	const primary: RateLimiter = {
		consume: async () => {
			calls.primary += 1;
			if (primaryFails) throw new Error("Connection is closed.");
			return { allowed: false, retryAfterMs: 1_000 };
		},
	};
	const fallback: RateLimiter = {
		consume: async () => {
			calls.fallback += 1;
			return { allowed: true, retryAfterMs: 0 };
		},
	};
	const log = {
		warn: (key: string) => calls.warnings.push(key),
	} as unknown as ThrottledLog;

	return {
		limiter: createFallbackRateLimiter({ primary, fallback, log }),
		calls,
	};
};

describe("createFallbackRateLimiter", () => {
	test("con Redis sano decide el compartido y el de memoria no se toca", async () => {
		const { limiter, calls } = createHarness(false);

		const decision = await limiter.consume("k", OPTS);

		expect(decision).toEqual({ allowed: false, retryAfterMs: 1_000 });
		expect(calls.fallback).toBe(0);
	});

	test("si el compartido falla, responde el de memoria y queda constancia", async () => {
		const { limiter, calls } = createHarness(true);

		const decision = await limiter.consume("k", OPTS);

		expect(decision).toEqual({ allowed: true, retryAfterMs: 0 });
		expect(calls.fallback).toBe(1);
		expect(calls.warnings).toEqual(["rate-limiter"]);
	});

	test("cada intento vuelve a probar el compartido: se recupera solo", async () => {
		const { limiter, calls } = createHarness(true);

		await limiter.consume("k", OPTS);
		await limiter.consume("k", OPTS);

		expect(calls.primary).toBe(2);
	});
});
