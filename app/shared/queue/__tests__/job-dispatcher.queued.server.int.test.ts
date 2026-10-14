import type { Redis } from "ioredis";
import { afterAll, describe, expect, test, vi } from "vitest";
import { createDbFixtures } from "@/core/__tests__/db.fixtures";
import { afterCommit, runInTransaction } from "@/core/db.server";
import type { Logger } from "../../logging/logger";
import { createThrottledLog } from "../../logging/throttled-log";
import type { JobHandlers } from "../job-dispatcher";
import { createQueuedJobDispatcher } from "../job-dispatcher.queued.server";
import {
	createQueueClient,
	createQueueConnection,
	queuePrefixOf,
} from "../queue.client.server";
import { JOB_NAMES, QUEUE_NAMES } from "../queue.config";

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
} as unknown as Logger;
const log = createThrottledLog(silentLogger, { intervalMs: 60_000 });
const prefix = queuePrefixOf(`int${Date.now().toString(36)}:`);
const fixtures = createDbFixtures();
const connections: Redis[] = [];

const queuesAt = (url: string) => {
	const connection = createQueueConnection(url, "producer", silentLogger);
	connections.push(connection);
	return createQueueClient({ connection, prefix });
};

const live = queuesAt(process.env.REDIS_TEST_URL as string);
const storageQueue = live.queueFor(QUEUE_NAMES.storage);

const dispatcherOver = (
	queues: ReturnType<typeof queuesAt>,
	deleteObject = vi.fn(async () => {}),
) => ({
	deleteObject,
	dispatcher: createQueuedJobDispatcher({
		queues,
		handlers: {
			[JOB_NAMES.deleteObject]: deleteObject,
		} as unknown as JobHandlers,
		afterCommit,
		log,
		logger: silentLogger,
	}),
});

const pendingKeys = async () =>
	(await storageQueue.getJobs(["waiting", "delayed"])).map(
		(job) => (job.data as { key: string }).key,
	);

describe("dispatcher con cola, transacción real y Redis real", () => {
	afterAll(async () => {
		await storageQueue.obliterate({ force: true });
		await live.close();
		for (const connection of connections) connection.disconnect();
		await fixtures.cleanup();
	});

	test("el trabajo se encola solo después del commit", async () => {
		const { dispatcher } = dispatcherOver(live);
		let pendingInsideTransaction: string[] = [];

		await runInTransaction(async () => {
			await fixtures.dependency();
			await dispatcher.dispatch(JOB_NAMES.deleteObject, {
				bucket: "b",
				key: "tras-commit",
			});
			pendingInsideTransaction = await pendingKeys();
		});

		expect(pendingInsideTransaction).not.toContain("tras-commit");
		expect(await pendingKeys()).toContain("tras-commit");
	});

	test("una transacción revertida no deja trabajo en la cola", async () => {
		const { dispatcher } = dispatcherOver(live);

		await expect(
			runInTransaction(async () => {
				await fixtures.dependency();
				await dispatcher.dispatch(JOB_NAMES.deleteObject, {
					bucket: "b",
					key: "revertido",
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");

		expect(await pendingKeys()).not.toContain("revertido");
	});

	test("si Redis no responde, el trabajo sigue su respaldo en el proceso", async () => {
		const { dispatcher, deleteObject } = dispatcherOver(
			queuesAt("redis://127.0.0.1:1"),
		);

		await runInTransaction(() =>
			dispatcher.dispatch(JOB_NAMES.deleteObject, {
				bucket: "b",
				key: "sin-redis",
			}),
		);

		await vi.waitFor(() =>
			expect(deleteObject).toHaveBeenCalledWith({
				bucket: "b",
				key: "sin-redis",
			}),
		);
	});
});
