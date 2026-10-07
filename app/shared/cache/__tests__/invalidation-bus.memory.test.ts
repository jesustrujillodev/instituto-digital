import { describe, expect, test } from "vitest";
import { createMemoryInvalidationBus } from "../invalidation-bus.memory";

describe("createMemoryInvalidationBus", () => {
	test("el aviso llega al propio proceso", async () => {
		const bus = createMemoryInvalidationBus();
		let received = 0;
		bus.subscribe("security-state:invalidate", () => {
			received += 1;
		});

		await bus.publish("security-state:invalidate");

		expect(received).toBe(1);
	});

	test("volver a suscribirse reemplaza el handler anterior", async () => {
		const bus = createMemoryInvalidationBus();
		const calls: string[] = [];
		bus.subscribe("canal", () => calls.push("viejo"));
		bus.subscribe("canal", () => calls.push("nuevo"));

		await bus.publish("canal");

		expect(calls).toEqual(["nuevo"]);
	});

	test("publicar sin suscriptores no falla", async () => {
		await expect(
			createMemoryInvalidationBus().publish("nadie"),
		).resolves.toBeUndefined();
	});
});
