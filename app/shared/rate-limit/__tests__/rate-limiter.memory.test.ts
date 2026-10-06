import { describe, expect, test } from "vitest";
import { createMemoryRateLimiter } from "../rate-limiter.memory";
import { describeRateLimiterContract } from "./rate-limiter.contract";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeRateLimiterContract("createMemoryRateLimiter", createMemoryRateLimiter);

describe("createMemoryRateLimiter", () => {
	// El barrido corre en cada consume: no debe llevarse por delante ventanas
	// vivas de otras claves, o el bloqueo se levantaría solo.
	test("the sweep does not drop live windows of other keys", async () => {
		const limiter = createMemoryRateLimiter();
		const shortOpts = { limit: 1, windowMs: 5 };
		const longOpts = { limit: 1, windowMs: 60_000 };
		await limiter.consume("corta", shortOpts);
		await limiter.consume("larga", longOpts);

		await sleep(20);
		await limiter.consume("corta", shortOpts); // dispara el barrido

		expect((await limiter.consume("larga", longOpts)).allowed).toBe(false);
	});

	test("a limit of 0 blocks from the second attempt", async () => {
		const limiter = createMemoryRateLimiter();
		const opts = { limit: 0, windowMs: 60_000 };

		expect((await limiter.consume("k", opts)).allowed).toBe(true);
		expect((await limiter.consume("k", opts)).allowed).toBe(false);
	});
});
