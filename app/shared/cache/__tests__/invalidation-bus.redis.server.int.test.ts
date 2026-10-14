import { Redis } from "ioredis";
import { afterAll, describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import { createThrottledLog } from "../../logging/throttled-log";
import { createRedisInvalidationBus } from "../invalidation-bus.redis.server";

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
} as unknown as Logger;
const log = createThrottledLog(silentLogger, { intervalMs: 60_000 });
const url = process.env.REDIS_TEST_URL as string;
const connections: Redis[] = [];

const ready = (connection: Redis) =>
	connection.status === "ready"
		? Promise.resolve()
		: new Promise((resolve) => connection.once("ready", resolve));

/**
 * Las dos conexiones de un proceso web, como `createRedisConnectionsFromEnv`.
 * Se espera a `ready` porque al conectarse el bus llama a todos sus handlers
 * (pudo perderse un aviso): una suscripción anterior contaría esa llamada.
 */
const node = async (keyPrefix: string) => {
	const command = new Redis(url, { keyPrefix });
	const subscriber = command.duplicate();
	connections.push(command, subscriber);
	const bus = createRedisInvalidationBus({
		command,
		subscriber,
		keyPrefix,
		log,
	});
	await Promise.all([ready(command), ready(subscriber)]);
	return bus;
};

const received = (bus: Awaited<ReturnType<typeof node>>, channel: string) =>
	new Promise<void>((resolve) => bus.subscribe(channel, resolve));

describe("bus de invalidación entre procesos con Redis real", () => {
	afterAll(() =>
		Promise.all(connections.map((connection) => connection.quit())),
	);

	test("lo que publica un nodo llega al otro", async () => {
		const prefix = `int${Date.now().toString(36)}:`;
		const publisher = await node(prefix);
		const listener = await node(prefix);
		const arrived = received(listener, "security-state");
		// La suscripción es asíncrona: se publica cuando Redis ya la registró.
		await new Promise((resolve) => setTimeout(resolve, 200));

		await publisher.publish("security-state");

		await expect(arrived).resolves.toBeUndefined();
	});

	test("un entorno con otro prefijo no recibe el aviso", async () => {
		const run = Date.now().toString(36);
		const publisher = await node(`qa${run}:`);
		const otherEnvironment = await node(`prod${run}:`);
		let calls = 0;
		otherEnvironment.subscribe("security-state", () => {
			calls += 1;
		});
		await new Promise((resolve) => setTimeout(resolve, 200));

		await publisher.publish("security-state");
		await new Promise((resolve) => setTimeout(resolve, 300));

		expect(calls).toBe(0);
	});
});
