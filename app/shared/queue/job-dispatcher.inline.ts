import type { Logger } from "../logging/logger";
import type { JobDispatcher, JobHandlers } from "./job-dispatcher";
import { FALLBACK_POLICY } from "./job-policies";
import type { DispatchableJob } from "./queue.config";
import type { JobPayloads } from "./queue.payloads";

/** Ejecuta un trabajo según su política de respaldo, sin cola. */
export const runFallback = async <N extends DispatchableJob>(
	name: N,
	payload: JobPayloads[N],
	handlers: JobHandlers,
	logger: Logger,
): Promise<void> => {
	const handler = handlers[name] as (payload: JobPayloads[N]) => Promise<void>;

	switch (FALLBACK_POLICY[name]) {
		case "skip":
			return;
		case "await":
			await handler(payload);
			return;
		case "background":
			void handler(payload).catch((error: unknown) =>
				logger.warn("background job failed", {
					job: name,
					message: error instanceof Error ? error.message : String(error),
				}),
			);
	}
};

/** Sin Redis: cada trabajo corre donde corría antes de existir la cola. */
export const createInlineJobDispatcher = ({
	handlers,
	logger,
}: {
	handlers: JobHandlers;
	logger: Logger;
}): JobDispatcher => ({
	dispatch: (name, payload) => runFallback(name, payload, handlers, logger),
});
