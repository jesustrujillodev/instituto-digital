import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import type { RedisConnections } from "../../redis/redis.client.server";
import { createInvalidationBus } from "../invalidation-bus.factory.server";

const logger = { warn: () => {}, info: () => {} } as unknown as Logger;
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("createInvalidationBus", () => {
	test("sin Redis avisa dentro del proceso", async () => {
		const bus = createInvalidationBus({ redis: null, logger });
		let received = 0;
		bus.subscribe("canal", () => {
			received += 1;
		});

		await bus.publish("canal");

		expect(received).toBe(1);
	});

	test("con Redis avisa entre conexiones", async () => {
		const command = new RedisMock({ keyPrefix: "ibf:" }) as unknown as Redis;
		const connections: RedisConnections = {
			command,
			subscriber: command.duplicate(),
			keyPrefix: "ibf:",
		};
		await flush();
		const bus = createInvalidationBus({ redis: connections, logger });
		let received = 0;
		bus.subscribe("canal", () => {
			received += 1;
		});
		await flush();

		await bus.publish("canal");
		await flush();

		expect(received).toBe(1);
	});
});
