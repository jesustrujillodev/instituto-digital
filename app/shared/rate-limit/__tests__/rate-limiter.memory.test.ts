import { describe, expect, test } from "vitest";
import { createMemoryRateLimiter } from "../rate-limiter.memory";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const OPTS = { limit: 3, windowMs: 60_000 };

describe("createMemoryRateLimiter", () => {
	test("allows exactly `limit` attempts inside the window", () => {
		const limiter = createMemoryRateLimiter();

		const decisions = [1, 2, 3].map(() => limiter.consume("ip:1.1.1.1", OPTS));

		expect(decisions.map((d) => d.allowed)).toEqual([true, true, true]);
		expect(decisions.map((d) => d.retryAfterMs)).toEqual([0, 0, 0]);
	});

	// El bloqueo llega en el intento limit + 1, no antes: cortar en el propio
	// `limit` regalaría un intento al atacante y se lo quitaría al usuario legítimo.
	test("blocks on attempt limit + 1", () => {
		const limiter = createMemoryRateLimiter();
		for (let i = 0; i < OPTS.limit; i++) limiter.consume("ip:1.1.1.1", OPTS);

		const blocked = limiter.consume("ip:1.1.1.1", OPTS);

		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterMs).toBeGreaterThan(0);
		expect(blocked.retryAfterMs).toBeLessThanOrEqual(OPTS.windowMs);
	});

	test("keeps blocking while the window is open", () => {
		const limiter = createMemoryRateLimiter();
		for (let i = 0; i < OPTS.limit + 1; i++) limiter.consume("k", OPTS);

		expect(limiter.consume("k", OPTS).allowed).toBe(false);
		expect(limiter.consume("k", OPTS).allowed).toBe(false);
	});

	// Ventana fija: al expirar se empieza de cero. Es lo que hace que un bloqueo
	// sea temporal y no una expulsión permanente.
	test("starts a fresh window once the old one expires", async () => {
		const limiter = createMemoryRateLimiter();
		const opts = { limit: 1, windowMs: 5 };
		limiter.consume("k", opts);
		expect(limiter.consume("k", opts).allowed).toBe(false);

		await sleep(20);

		expect(limiter.consume("k", opts).allowed).toBe(true);
	});

	// Las claves son independientes: bloquear a un email no puede dejar fuera al
	// resto, que es justo lo que pasaría con un contador global.
	test("counts each key independently", () => {
		const limiter = createMemoryRateLimiter();
		for (let i = 0; i < OPTS.limit + 1; i++) limiter.consume("email:a", OPTS);

		expect(limiter.consume("email:a", OPTS).allowed).toBe(false);
		expect(limiter.consume("email:b", OPTS).allowed).toBe(true);
	});

	// El barrido corre en cada consume: no debe llevarse por delante ventanas
	// vivas de otras claves, o el bloqueo se levantaría solo.
	test("the sweep does not drop live windows of other keys", async () => {
		const limiter = createMemoryRateLimiter();
		const shortOpts = { limit: 1, windowMs: 5 };
		const longOpts = { limit: 1, windowMs: 60_000 };
		limiter.consume("corta", shortOpts);
		limiter.consume("larga", longOpts);

		await sleep(20);
		limiter.consume("corta", shortOpts); // dispara el barrido

		expect(limiter.consume("larga", longOpts).allowed).toBe(false);
	});

	test("a limit of 0 blocks from the second attempt", () => {
		const limiter = createMemoryRateLimiter();
		const opts = { limit: 0, windowMs: 60_000 };

		expect(limiter.consume("k", opts).allowed).toBe(true);
		expect(limiter.consume("k", opts).allowed).toBe(false);
	});
});
