import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { createPassthroughVersionedCache } from "../versioned-cache.passthrough";

const READ = {
	name: "resumen",
	key: "2026",
	dependsOn: ["credits"],
	ttlS: 300,
	schema: v.number(),
};

describe("createPassthroughVersionedCache", () => {
	test("sin Redis siempre calcula", async () => {
		const cache = createPassthroughVersionedCache();
		let computed = 0;
		const compute = async () => ++computed;

		await cache.getOrCompute(READ, compute);
		await cache.getOrCompute(READ, compute);

		expect(computed).toBe(2);
	});

	test("invalidar no hace nada y no falla", async () => {
		await expect(
			createPassthroughVersionedCache().invalidate("credits"),
		).resolves.toBeUndefined();
	});
});
