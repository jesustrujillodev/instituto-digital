/**
 * Proceso de colas (docs/queues/00-colas.md): consume los trabajos que encola
 * la app web y programa el mantenimiento. Se despliega como un servicio aparte
 * con la misma imagen: `node build/worker/index.js` (en desarrollo,
 * `bun run worker`).
 */
import { type Job, Worker } from "bullmq";
import { env } from "@/core/env.server";
import { createSystemContainer } from "@/shared/di/container.server";
import { createJobHandlers } from "@/shared/di/job-handlers.server";
import {
	createQueueClient,
	createQueueConnection,
	queuePrefixOf,
} from "@/shared/queue/queue.client.server";
import {
	JOB_NAMES,
	MAINTENANCE_SCHEDULES,
	MAINTENANCE_TIMEZONE,
	OUTBOX_SWEEP_EVERY_MS,
	QUEUE_NAMES,
	type QueueName,
} from "@/shared/queue/queue.config";
import {
	createJobProcessor,
	toFailureRecord,
} from "@/shared/queue/queue.processor.server";

const redisUrl = env.REDIS_URL;
if (!redisUrl) {
	console.error(
		"worker: REDIS_URL no está definida. Sin Redis no hay colas que consumir; la app web entrega el correo con su poller.",
	);
	process.exit(1);
}

const { cradle } = createSystemContainer();
const logger = cradle.logger.child({ module: "worker" });
const prefix = queuePrefixOf(env.REDIS_KEY_PREFIX);
const process_ = createJobProcessor(createJobHandlers(cradle));

const CONCURRENCY: Record<QueueName, number> = {
	[QUEUE_NAMES.emails]: env.QUEUE_EMAIL_CONCURRENCY,
	[QUEUE_NAMES.courseSync]: env.QUEUE_COURSE_SYNC_CONCURRENCY,
	[QUEUE_NAMES.storage]: env.QUEUE_STORAGE_CONCURRENCY,
	// Las purgas no compiten entre sí.
	[QUEUE_NAMES.maintenance]: 1,
};

const workers = Object.values(QUEUE_NAMES).map((queueName) => {
	const worker = new Worker(queueName, (job: Job) => process_(job), {
		connection: createQueueConnection(redisUrl, "worker", logger),
		prefix,
		concurrency: CONCURRENCY[queueName],
	});

	worker.on("failed", (job, error) => {
		if (!job) return;
		logger.warn("job failed", {
			queue: queueName,
			job: job.name,
			jobId: job.id,
			attempt: job.attemptsMade,
			message: error.message,
		});
		const failure = toFailureRecord(job, error);
		if (!failure) return;
		cradle.jobFailureRepository.record(failure).catch((recordError) =>
			logger.error("job failure not recorded", {
				jobId: job.id,
				message:
					recordError instanceof Error ? recordError.message : recordError,
			}),
		);
	});
	worker.on("error", (error) =>
		logger.warn("worker error", { queue: queueName, message: error.message }),
	);
	return worker;
});

// Programar es idempotente por id: reiniciar el worker, o correr varios, no
// duplica nada.
const schedules = createQueueClient({
	connection: createQueueConnection(redisUrl, "worker", logger),
	prefix,
});
await schedules
	.queueFor(QUEUE_NAMES.emails)
	.upsertJobScheduler(
		JOB_NAMES.sweepOutbox,
		{ every: OUTBOX_SWEEP_EVERY_MS },
		{ name: JOB_NAMES.sweepOutbox, data: {} },
	);
for (const { name, pattern } of MAINTENANCE_SCHEDULES) {
	await schedules
		.queueFor(QUEUE_NAMES.maintenance)
		.upsertJobScheduler(
			name,
			{ pattern, tz: MAINTENANCE_TIMEZONE },
			{ name, data: {} },
		);
}

logger.info("worker started", { queues: Object.values(QUEUE_NAMES), prefix });

// Un deploy manda SIGTERM: se terminan los trabajos en curso antes de salir.
let closing = false;
const shutdown = async (signal: string) => {
	if (closing) return;
	closing = true;
	logger.info("worker stopping", { signal });
	await Promise.allSettled(workers.map((worker) => worker.close()));
	await schedules.close();
	await cradle.prisma.$disconnect();
	process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
