import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { describe, expect, test } from "vitest";
import type { ThrottledLog } from "../../logging/throttled-log";
import { createRedisInvalidationBus } from "../invalidation-bus.redis.server";

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

let instance = 0;

/**
 * Un "nodo": su conexión de comandos y su conexión suscrita, sobre el mismo
 * Redis. Se espera al primer `ready`, que también avisa a los handlers.
 */
const createNode = async (keyPrefix: string) => {
	const command = new RedisMock({ keyPrefix }) as unknown as Redis;
	const subscriber = command.duplicate();
	await flush();
	const warnings: string[] = [];
	const log = {
		warn: (_key: string, message: string) => warnings.push(message),
	} as unknown as ThrottledLog;
	return {
		command,
		subscriber,
		warnings,
		bus: createRedisInvalidationBus({ command, subscriber, keyPrefix, log }),
	};
};

describe("createRedisInvalidationBus", () => {
	test("el aviso de un nodo llega a los demás", async () => {
		const prefix = `bus${++instance}:`;
		const nodeA = await createNode(prefix);
		const nodeB = await createNode(prefix);
		let received = 0;
		nodeB.bus.subscribe("security-state:invalidate", () => {
			received += 1;
		});
		await flush();

		await nodeA.bus.publish("security-state:invalidate");
		await flush();

		expect(received).toBe(1);
	});

	// Dos entornos en la misma instancia no se invalidan entre sí.
	test("el canal lleva el prefijo del entorno", async () => {
		const staging = await createNode(`staging${++instance}:`);
		const production = await createNode(`production${instance}:`);
		let received = 0;
		production.bus.subscribe("security-state:invalidate", () => {
			received += 1;
		});
		await flush();

		await staging.bus.publish("security-state:invalidate");
		await flush();

		expect(received).toBe(0);
	});

	// Lo que pasa en cada recarga en caliente: el módulo se vuelve a evaluar y
	// se suscribe otra vez sobre la misma conexión.
	test("recrear el bus sobre la misma conexión no duplica el aviso", async () => {
		const prefix = `hmr${++instance}:`;
		const node = await createNode(prefix);
		const calls: string[] = [];
		node.bus.subscribe("canal", () => calls.push("antes"));
		const reloaded = createRedisInvalidationBus({
			command: node.command,
			subscriber: node.subscriber,
			keyPrefix: prefix,
			log: { warn: () => {} } as unknown as ThrottledLog,
		});
		reloaded.subscribe("canal", () => calls.push("después"));
		await flush();

		await reloaded.publish("canal");
		await flush();

		expect(calls).toEqual(["después"]);
	});

	// Mientras la conexión estuvo caída pudo perderse un aviso: al volver, cada
	// caché suscrita se trata como vencida.
	test("al reconectar la conexión suscrita, avisa a todos los handlers", async () => {
		const node = await createNode(`ready${++instance}:`);
		const calls: string[] = [];
		node.bus.subscribe("uno", () => calls.push("uno"));
		node.bus.subscribe("dos", () => calls.push("dos"));

		node.subscriber.emit("ready");

		expect(calls).toEqual(["uno", "dos"]);
	});

	test("publicar con Redis caído no lanza y deja constancia", async () => {
		const node = await createNode(`down${++instance}:`);
		Object.assign(node.command, {
			publish: () => Promise.reject(new Error("Connection is closed.")),
		});

		await expect(node.bus.publish("canal")).resolves.toBeUndefined();
		expect(node.warnings).toEqual(["invalidation not published"]);
	});

	test("una suscripción que falla no lanza y deja constancia", async () => {
		const node = await createNode(`subfail${++instance}:`);
		Object.assign(node.subscriber, {
			subscribe: () => Promise.reject(new Error("Connection is closed.")),
		});

		node.bus.subscribe("canal", () => {});
		await flush();

		expect(node.warnings).toEqual(["invalidation subscribe failed"]);
	});
});
