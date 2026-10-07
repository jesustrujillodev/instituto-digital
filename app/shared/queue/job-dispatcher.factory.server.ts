import type { AfterCommit } from "@/core/db.server";
import type { Logger } from "../logging/logger";
import type { ThrottledLog } from "../logging/throttled-log";
import type { JobDispatcher, JobHandlers, JobQueues } from "./job-dispatcher";
import { createInlineJobDispatcher } from "./job-dispatcher.inline";
import { createQueuedJobDispatcher } from "./job-dispatcher.queued.server";

/** Con colas encola tras el commit; sin ellas, cada trabajo corre como antes. */
export const createJobDispatcher = ({
	queues,
	handlers,
	afterCommit,
	log,
	logger,
}: {
	queues: JobQueues | null;
	handlers: JobHandlers;
	afterCommit: AfterCommit;
	log: ThrottledLog;
	logger: Logger;
}): JobDispatcher =>
	queues
		? createQueuedJobDispatcher({ queues, handlers, afterCommit, log, logger })
		: createInlineJobDispatcher({ handlers, logger });
