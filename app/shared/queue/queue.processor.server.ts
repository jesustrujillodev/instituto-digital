import { UnrecoverableError } from "bullmq";
import type { JobHandlers } from "./job-dispatcher";
import type { JobFailureRecord } from "./job-failure.port";
import { QUEUE_NAMES } from "./queue.config";
import { isJobName, parseJobPayload } from "./queue.payloads";

/** Lo que el procesador y el registro de fallos leen de un trabajo de BullMQ. */
export interface JobLike {
	id?: string;
	name: string;
	queueName: string;
	data: unknown;
	attemptsMade: number;
	opts: { attempts?: number };
}

/**
 * Valida y enruta un trabajo a su handler. Un nombre o un payload que no
 * cumplen no mejoran reintentando: van directo a fallo definitivo.
 */
export const createJobProcessor =
	(handlers: JobHandlers) =>
	async (job: JobLike): Promise<void> => {
		const { name } = job;
		if (!isJobName(name)) {
			throw new UnrecoverableError(`unknown job: ${name}`);
		}

		let payload: unknown;
		try {
			payload = parseJobPayload(name, job.data);
		} catch {
			throw new UnrecoverableError(`invalid payload for job: ${name}`);
		}

		await (handlers[name] as (payload: unknown) => Promise<void>)(payload);
	};

/** Agotó sus intentos, o su error dice que no vale la pena reintentar. */
export const isFinalFailure = (job: JobLike, error: Error): boolean =>
	error.name === UnrecoverableError.name ||
	job.attemptsMade >= (job.opts.attempts ?? 1);

/**
 * El fallo que se guarda en `job_failure`, o `null` si no va ahí: el correo
 * queda en su fila del outbox, que el barrido vuelve a encolar.
 */
export const toFailureRecord = (
	job: JobLike,
	error: Error,
): JobFailureRecord | null => {
	if (job.queueName === QUEUE_NAMES.emails) return null;
	if (!isFinalFailure(job, error)) return null;

	return {
		queue: job.queueName,
		name: job.name,
		jobId: job.id ?? "",
		payload: job.data,
		error: error.stack ?? error.message,
		attempts: job.attemptsMade,
	};
};
