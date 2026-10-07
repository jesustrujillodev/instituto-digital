import { describe, expect, test } from "vitest";
import { createAfterCommitQueue } from "@/core/after-commit.server";
import type { Logger } from "../../logging/logger";
import type { ThrottledLog } from "../../logging/throttled-log";
import type { JobQueues } from "../job-dispatcher";
import { createJobDispatcher } from "../job-dispatcher.factory.server";
import { JOB_NAMES } from "../queue.config";
import { createHandlersDouble } from "./job-handlers.double";

const logger = {
	warn: () => {},
	error: () => {},
} as unknown as Logger;
const log = { warn: () => {} } as unknown as ThrottledLog;
const { afterCommit } = createAfterCommitQueue();
const RECALC = { courseId: 7, actorId: 3, at: "2026-10-06T18:00:00.000Z" };

describe("createJobDispatcher", () => {
	test("con colas, el trabajo va a la cola", async () => {
		const added: string[] = [];
		const queues: JobQueues = {
			add: async (name) => {
				added.push(name);
			},
		};
		const { handlers, ran } = createHandlersDouble();

		await createJobDispatcher({
			queues,
			handlers,
			afterCommit,
			log,
			logger,
		}).dispatch(JOB_NAMES.recalculateProgress, RECALC);

		expect(added).toEqual([JOB_NAMES.recalculateProgress]);
		expect(ran).toEqual([]);
	});

	test("sin colas, corre donde corría antes", async () => {
		const { handlers, ran } = createHandlersDouble();

		await createJobDispatcher({
			queues: null,
			handlers,
			afterCommit,
			log,
			logger,
		}).dispatch(JOB_NAMES.recalculateProgress, RECALC);

		expect(ran).toEqual([JOB_NAMES.recalculateProgress]);
	});
});
