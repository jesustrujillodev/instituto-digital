import { describe, expect, test } from "vitest";
import { createAfterCommitQueue } from "@/core/after-commit.server";
import type { Logger } from "../../logging/logger";
import type { ThrottledLog } from "../../logging/throttled-log";
import type { JobQueues } from "../job-dispatcher";
import { createQueuedJobDispatcher } from "../job-dispatcher.queued.server";
import { JOB_NAMES } from "../queue.config";
import { createHandlersDouble } from "./job-handlers.double";

const RECALC = {
	courseId: 7,
	actorId: 3,
	at: "2026-10-06T18:00:00.000Z",
};

const silentLogger = {
	warn: () => {},
	error: () => {},
	info: () => {},
	debug: () => {},
} as unknown as Logger;

const createHarness = (options: { addFails?: boolean } = {}) => {
	const added: { name: string; payload: unknown }[] = [];
	const warnings: string[] = [];
	const queues: JobQueues = {
		add: async (name, payload) => {
			if (options.addFails) throw new Error("Connection is closed.");
			added.push({ name, payload });
		},
	};
	const { handlers, ran } = createHandlersDouble();
	const afterCommitQueue = createAfterCommitQueue();

	const dispatcher = createQueuedJobDispatcher({
		queues,
		handlers,
		afterCommit: afterCommitQueue.afterCommit,
		log: {
			warn: (_key: string, message: string) => warnings.push(message),
		} as unknown as ThrottledLog,
		logger: silentLogger,
	});

	return { dispatcher, added, ran, warnings, track: afterCommitQueue.track };
};

describe("createQueuedJobDispatcher", () => {
	test("encola tras el commit, no antes", async () => {
		const { dispatcher, added, track } = createHarness();
		let addedInsideTransaction = -1;

		await track(async () => {
			await dispatcher.dispatch(JOB_NAMES.recalculateProgress, RECALC);
			addedInsideTransaction = added.length;
		});

		expect(addedInsideTransaction).toBe(0);
		expect(added).toEqual([
			{ name: JOB_NAMES.recalculateProgress, payload: RECALC },
		]);
	});

	test("un rollback no deja trabajo en la cola", async () => {
		const { dispatcher, added, track } = createHarness();

		await expect(
			track(async () => {
				await dispatcher.dispatch(JOB_NAMES.recalculateProgress, RECALC);
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");

		expect(added).toEqual([]);
	});

	test("fuera de una transacción encola en el momento", async () => {
		const { dispatcher, added } = createHarness();

		await dispatcher.dispatch(JOB_NAMES.deleteObject, {
			bucket: "b",
			key: "k",
		});

		expect(added).toHaveLength(1);
	});

	// Redis caído al encolar: el trabajo no se pierde.
	test("si no puede encolar, el recálculo corre en ese momento", async () => {
		const { dispatcher, ran, warnings } = createHarness({ addFails: true });

		await dispatcher.dispatch(JOB_NAMES.recalculateProgress, RECALC);

		expect(ran).toEqual([JOB_NAMES.recalculateProgress]);
		expect(warnings).toEqual(["job enqueue failed: running fallback"]);
	});

	test("si no puede encolar un correo, lo deja al barrido", async () => {
		const { dispatcher, ran } = createHarness({ addFails: true });

		await dispatcher.dispatch(JOB_NAMES.deliverEmail, {
			outboxId: 1,
			attempt: 0,
		});

		expect(ran).toEqual([]);
	});
});
