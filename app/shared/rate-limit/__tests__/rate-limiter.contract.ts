import { describe, expect, test } from "vitest";
import type { RateLimiter } from "../rate-limiter";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const OPTS = { limit: 3, windowMs: 60_000 };

const consumeTimes = async (
	limiter: RateLimiter,
	key: string,
	times: number,
	opts = OPTS,
) => {
	const decisions = [];
	for (let i = 0; i < times; i++) {
		decisions.push(await limiter.consume(key, opts));
	}
	return decisions;
};

/**
 * Lo que todo adaptador del puerto garantiza, sea de ventana fija o deslizante.
 * No es un `*.test.ts`: lo ejecuta la prueba de cada adaptador.
 */
export const describeRateLimiterContract = (
	name: string,
	createLimiter: () => RateLimiter,
) => {
	describe(`${name} (contrato RateLimiter)`, () => {
		test("allows exactly `limit` attempts inside the window", async () => {
			const decisions = await consumeTimes(createLimiter(), "ip:1.1.1.1", 3);

			expect(decisions.map((d) => d.allowed)).toEqual([true, true, true]);
			expect(decisions.map((d) => d.retryAfterMs)).toEqual([0, 0, 0]);
		});

		// El bloqueo llega en el intento limit + 1, no antes: cortar en el propio
		// `limit` regalaría un intento al atacante y se lo quitaría al legítimo.
		test("blocks on attempt limit + 1", async () => {
			const limiter = createLimiter();
			await consumeTimes(limiter, "ip:1.1.1.1", OPTS.limit);

			const blocked = await limiter.consume("ip:1.1.1.1", OPTS);

			expect(blocked.allowed).toBe(false);
			expect(blocked.retryAfterMs).toBeGreaterThan(0);
			expect(blocked.retryAfterMs).toBeLessThanOrEqual(OPTS.windowMs);
		});

		test("keeps blocking while the window is open", async () => {
			const limiter = createLimiter();
			await consumeTimes(limiter, "k", OPTS.limit + 1);

			expect((await limiter.consume("k", OPTS)).allowed).toBe(false);
			expect((await limiter.consume("k", OPTS)).allowed).toBe(false);
		});

		// Lo que hace que un bloqueo sea temporal y no una expulsión permanente.
		test("allows again once the window has passed", async () => {
			const limiter = createLimiter();
			// Ventana holgada: con la suite completa en paralelo, dos llamadas
			// seguidas pueden separarse decenas de ms y la ventana pasaría sola.
			const opts = { limit: 1, windowMs: 500 };
			await limiter.consume("k", opts);
			expect((await limiter.consume("k", opts)).allowed).toBe(false);

			await sleep(700);

			expect((await limiter.consume("k", opts)).allowed).toBe(true);
		});

		// Bloquear a un email no puede dejar fuera al resto, que es justo lo que
		// pasaría con un contador global.
		test("counts each key independently", async () => {
			const limiter = createLimiter();
			await consumeTimes(limiter, "email:a", OPTS.limit + 1);

			expect((await limiter.consume("email:a", OPTS)).allowed).toBe(false);
			expect((await limiter.consume("email:b", OPTS)).allowed).toBe(true);
		});
	});
};
