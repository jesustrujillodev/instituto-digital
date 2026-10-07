import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { afterAll, describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import {
	createQueueClient,
	createQueueConnection,
	queuePrefixOf,
} from "../queue.client.server";
import { JOB_NAMES, QUEUE_NAMES } from "../queue.config";

/**
 * Contra un Redis real: `ioredis-mock` no ejecuta los scripts Lua de BullMQ.
 * `REDIS_TEST_URL=redis://localhost:6379 bun run test app/shared/queue`.
 */
const REDIS_TEST_URL = process.env.REDIS_TEST_URL;

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
} as unknown as Logger;

describe.runIf(REDIS_TEST_URL)("colas con Redis real", () => {
	const url = REDIS_TEST_URL as string;
	const prefix = queuePrefixOf(`test${Date.now().toString(36)}:`);
	const connections: Redis[] = [];
	const workers: Worker[] = [];

	const connection = (role: "producer" | "worker") => {
		const created = createQueueConnection(url, role, silentLogger);
		connections.push(created);
		return created;
	};

	const client = createQueueClient({
		connection: connection("worker"),
		prefix,
	});

	afterAll(async () => {
		await Promise.all(workers.map((worker) => worker.close()));
		for (const queueName of Object.values(QUEUE_NAMES)) {
			await client.queueFor(queueName).obliterate({ force: true });
		}
		await client.close();
		await Promise.all(connections.map((created) => created.quit()));
	});

	const startWorker = (
		queueName: string,
		process: (job: Job) => Promise<void>,
	) => {
		const worker = new Worker(queueName, process, {
			connection: connection("worker"),
			prefix,
		});
		workers.push(worker);
		return worker;
	};

	test("un trabajo encolado llega a su worker con su payload", async () => {
		const received = new Promise<unknown>((resolve) => {
			startWorker(QUEUE_NAMES.storage, async (job) => resolve(job.data));
		});

		await client.add(JOB_NAMES.deleteObject, { bucket: "b", key: "k.pdf" });

		expect(await received).toEqual({ bucket: "b", key: "k.pdf" });
	});

	// Un barrido que vuelve a encolar la misma fila e intento no duplica.
	test("la misma fila e intento del outbox se encola una sola vez", async () => {
		const payload = { outboxId: 77, attempt: 0 };

		await client.add(JOB_NAMES.deliverEmail, payload);
		await client.add(JOB_NAMES.deliverEmail, payload);
		await client.add(JOB_NAMES.deliverEmail, { outboxId: 77, attempt: 1 });

		const jobs = await client
			.queueFor(QUEUE_NAMES.emails)
			.getJobs(["waiting", "delayed"]);
		expect(jobs.map((job) => job.id).sort()).toEqual([
			"outbox-77-0",
			"outbox-77-1",
		]);
	});

	test("ediciones seguidas del mismo curso dejan un solo recálculo, con la última fecha", async () => {
		const queue = client.queueFor(QUEUE_NAMES.courseSync);
		for (const second of ["01", "02", "03"]) {
			await client.add(JOB_NAMES.recalculateProgress, {
				courseId: 7,
				actorId: 3,
				at: `2026-10-06T18:00:${second}.000Z`,
			});
		}
		await client.add(JOB_NAMES.recalculateProgress, {
			courseId: 8,
			actorId: 3,
			at: "2026-10-06T18:00:00.000Z",
		});

		const delayed = await queue.getJobs(["delayed"]);
		const course7 = delayed.filter((job) => job.data.courseId === 7);
		expect(course7).toHaveLength(1);
		expect(course7[0].data.at).toBe("2026-10-06T18:00:03.000Z");
		expect(delayed.filter((job) => job.data.courseId === 8)).toHaveLength(1);
	});

	// Una edición que llega con el recálculo corriendo no se pierde: corre otro
	// al terminar, nunca dos a la vez.
	test("una edición durante un recálculo activo produce otro al terminar", async () => {
		const queue = client.queueFor(QUEUE_NAMES.courseSync);
		await queue.obliterate({ force: true });

		let release: () => void = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const runs: string[] = [];
		let active = 0;
		let maxActive = 0;
		const done = new Promise<void>((resolve) => {
			const worker = startWorker(QUEUE_NAMES.courseSync, async (job) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				runs.push(job.data.at);
				if (runs.length === 1) await blocked;
				active -= 1;
				if (runs.length === 2) resolve();
			});
			worker.concurrency = 2;
		});

		await client.add(JOB_NAMES.recalculateProgress, {
			courseId: 9,
			actorId: 3,
			at: "2026-10-06T18:00:01.000Z",
		});
		await new Promise((resolve) => setTimeout(resolve, 2_600));
		await client.add(JOB_NAMES.recalculateProgress, {
			courseId: 9,
			actorId: 3,
			at: "2026-10-06T18:00:02.000Z",
		});
		release();
		await done;

		expect(runs).toEqual([
			"2026-10-06T18:00:01.000Z",
			"2026-10-06T18:00:02.000Z",
		]);
		expect(maxActive).toBe(1);
	}, 15_000);

	test("programar dos veces el mismo scheduler deja uno solo", async () => {
		const queue = client.queueFor(QUEUE_NAMES.maintenance);
		for (let i = 0; i < 2; i += 1) {
			await queue.upsertJobScheduler(
				JOB_NAMES.purgeExpiredSessions,
				{ pattern: "0 3 * * *", tz: "America/Tijuana" },
				{ name: JOB_NAMES.purgeExpiredSessions, data: {} },
			);
		}

		expect(await queue.getJobSchedulersCount()).toBe(1);
	});
});
