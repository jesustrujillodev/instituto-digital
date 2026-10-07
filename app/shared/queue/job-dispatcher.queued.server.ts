import type { AfterCommit } from "@/core/db.server";
import type { Logger } from "../logging/logger";
import type { ThrottledLog } from "../logging/throttled-log";
import type { JobDispatcher, JobHandlers, JobQueues } from "./job-dispatcher";
import { runFallback } from "./job-dispatcher.inline";

/**
 * Encola tras el commit: un trabajo de una transacción revertida nunca llega a
 * la cola. Si Redis no responde, el trabajo sigue su respaldo en ese momento
 * en vez de perderse.
 */
export const createQueuedJobDispatcher = ({
	queues,
	handlers,
	afterCommit,
	log,
	logger,
}: {
	queues: JobQueues;
	handlers: JobHandlers;
	afterCommit: AfterCommit;
	log: ThrottledLog;
	logger: Logger;
}): JobDispatcher => ({
	dispatch: (name, payload) =>
		afterCommit(async () => {
			try {
				await queues.add(name, payload);
			} catch (error) {
				log.warn(`queue:${name}`, "job enqueue failed: running fallback", {
					job: name,
					message: error instanceof Error ? error.message : String(error),
				});
				try {
					await runFallback(name, payload, handlers, logger);
				} catch (fallbackError) {
					logger.error("job fallback failed", {
						job: name,
						message:
							fallbackError instanceof Error
								? fallbackError.message
								: String(fallbackError),
					});
				}
			}
		}),
});
