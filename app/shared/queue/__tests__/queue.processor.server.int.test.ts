import { type Job, Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { afterAll, describe, expect, test } from "vitest";
import { prisma } from "@/core/db.server";
import { createSystemContainer } from "@/shared/di/container.server";
import { createJobHandlers } from "@/shared/di/job-handlers.server";
import { waitForMail } from "@/shared/mail/__tests__/mailpit.client";
import {
	createQueueClient,
	createQueueConnection,
	queuePrefixOf,
} from "../queue.client.server";
import { JOB_NAMES, QUEUE_NAMES } from "../queue.config";
import { createJobProcessor, toFailureRecord } from "../queue.processor.server";

/**
 * El cableado de `app/worker.server.ts` con los handlers reales del cradle:
 * Postgres y Mailpit de compose.test.yml, y un prefijo de cola propio.
 */
const url = process.env.REDIS_TEST_URL as string;
const run = Date.now().toString(36);
const prefix = queuePrefixOf(`int${run}:`);
const { cradle } = createSystemContainer();
const logger = cradle.logger.child({ module: "worker-int" });

const connections: Redis[] = [];
const connection = (role: "producer" | "worker") => {
	const created = createQueueConnection(url, role, logger);
	connections.push(created);
	return created;
};
const client = createQueueClient({ connection: connection("worker"), prefix });
const processJob = createJobProcessor(createJobHandlers(cradle));
const failures: Promise<unknown>[] = [];

const workers = Object.values(QUEUE_NAMES).map((queueName) => {
	const worker = new Worker(queueName, (job: Job) => processJob(job), {
		connection: connection("worker"),
		prefix,
	});
	worker.on("failed", (job, error) => {
		const failure = job && toFailureRecord(job, error);
		if (failure) failures.push(cradle.jobFailureRepository.record(failure));
	});
	return worker;
});

const eventually = async (
	check: () => Promise<boolean>,
	timeoutMs = 10_000,
) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`La condición no se cumplió en ${timeoutMs} ms`);
};

describe("worker de colas con Redis, Postgres y Mailpit reales", () => {
	afterAll(async () => {
		await Promise.all(workers.map((worker) => worker.close()));
		for (const queueName of Object.values(QUEUE_NAMES)) {
			await client.queueFor(queueName).obliterate({ force: true });
		}
		await client.close();
		await Promise.all(connections.map((created) => created.quit()));
		await prisma.emailOutbox.deleteMany({
			where: { recipient: { startsWith: `worker-${run}` } },
		});
		await prisma.jobFailure.deleteMany({
			where: { jobId: { startsWith: `int-${run}` } },
		});
	});

	test("deliver-email entrega el mensaje del outbox y lo marca enviado", async () => {
		const recipient = `worker-${run}@idc.test`;
		const [ref] = await cradle.notificationRepository.enqueue([
			{
				template: "ACCOUNT_CREATED",
				recipient,
				subject: "Tu cuenta",
				text: "Bienvenida",
				html: "<p>Bienvenida</p>",
			},
		]);

		await client.add(JOB_NAMES.deliverEmail, {
			outboxId: ref.id,
			attempt: ref.attempts,
		});

		expect((await waitForMail(recipient)).Subject).toBe("Tu cuenta");
		await eventually(async () => {
			const row = await prisma.emailOutbox.findUniqueOrThrow({
				where: { id: ref.id },
			});
			return row.status === "SENT";
		});
	});

	test("un trabajo que agota sus intentos queda en job_failure", async () => {
		const jobId = `int-${run}-ajeno`;

		await client
			.queueFor(QUEUE_NAMES.storage)
			.add(
				JOB_NAMES.deleteObject,
				{ bucket: "bucket-ajeno", key: "x" },
				{ jobId, attempts: 1 },
			);

		await eventually(async () => {
			await Promise.all(failures);
			return (await prisma.jobFailure.count({ where: { jobId } })) === 1;
		});
		expect(
			await prisma.jobFailure.findFirstOrThrow({ where: { jobId } }),
		).toMatchObject({
			queue: QUEUE_NAMES.storage,
			name: JOB_NAMES.deleteObject,
			attempts: 1,
			error: expect.stringContaining("bucket no configurado"),
		});
	});

	test("close() espera al trabajo en curso antes de soltar la cola", async () => {
		let finished = false;
		const queueName = `int-${run}-cierre`;
		const worker = new Worker(
			queueName,
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 500));
				finished = true;
			},
			{ connection: connection("worker"), prefix },
		);
		const started = new Promise((resolve) => worker.once("active", resolve));
		// Cola propia de la prueba: `queueFor` solo arma las de la app.
		const queue = new Queue(queueName, {
			connection: connection("worker"),
			prefix,
		});

		await queue.add("lento", {});
		await started;
		await worker.close();

		expect(finished).toBe(true);
		await queue.obliterate({ force: true });
		await queue.close();
	});
});
