import { afterEach, describe, expect, test, vi } from "vitest";
import { createMemoryRateLimiter } from "../rate-limiter.memory";
import { describeRateLimiterContract } from "./rate-limiter.contract";

describeRateLimiterContract("createMemoryRateLimiter", createMemoryRateLimiter);

describe("createMemoryRateLimiter", () => {
	// El barrido no debe llevarse por delante ventanas vivas de otras claves, o
	// el bloqueo se levantaría solo.
	test("the sweep does not drop live windows of other keys", async () => {
		vi.useFakeTimers();
		const limiter = createMemoryRateLimiter();
		const shortOpts = { limit: 1, windowMs: 5 };
		const longOpts = { limit: 1, windowMs: 60_000 };
		await limiter.consume("corta", shortOpts);
		await limiter.consume("larga", longOpts);

		vi.advanceTimersByTime(1_000);
		await limiter.consume("corta", shortOpts); // dispara el barrido

		expect((await limiter.consume("larga", longOpts)).allowed).toBe(false);
		vi.useRealTimers();
	});

	describe("barrido", () => {
		afterEach(() => {
			vi.useRealTimers();
			vi.restoreAllMocks();
		});

		// El hallazgo: el barrido recorría todas las claves vivas en cada intento,
		// así que el costo total crecía con el cuadrado de la tasa de peticiones.
		test("no recorre las claves en cada intento", async () => {
			vi.useFakeTimers();
			const limiter = createMemoryRateLimiter();
			const opts = { limit: 5, windowMs: 60_000 };
			await limiter.consume("primera", opts);
			const walks = vi.spyOn(Map.prototype, Symbol.iterator);

			for (let i = 0; i < 1_000; i++) {
				await limiter.consume(`auth:login:email:${i}@x.mx`, opts);
			}

			expect(walks.mock.calls.length).toBe(0);
		});

		test("vuelve a barrer pasado el intervalo", async () => {
			vi.useFakeTimers();
			const limiter = createMemoryRateLimiter();
			const opts = { limit: 5, windowMs: 60_000 };
			await limiter.consume("primera", opts);
			const walks = vi.spyOn(Map.prototype, Symbol.iterator);

			vi.advanceTimersByTime(1_000);
			await limiter.consume("segunda", opts);

			expect(walks.mock.calls.length).toBe(1);
		});

		// El barrido solo libera memoria: una ventana vencida que sigue en el Map
		// no bloquea, porque cada intento compara con su propio `resetAt`.
		test("una ventana vencida sin barrer no bloquea", async () => {
			vi.useFakeTimers();
			const limiter = createMemoryRateLimiter();
			const opts = { limit: 1, windowMs: 100 };
			await limiter.consume("k", opts);
			expect((await limiter.consume("k", opts)).allowed).toBe(false);

			vi.advanceTimersByTime(150);

			expect((await limiter.consume("k", opts)).allowed).toBe(true);
		});
	});

	test("a limit of 0 blocks from the second attempt", async () => {
		const limiter = createMemoryRateLimiter();
		const opts = { limit: 0, windowMs: 60_000 };

		expect((await limiter.consume("k", opts)).allowed).toBe(true);
		expect((await limiter.consume("k", opts)).allowed).toBe(false);
	});
});
