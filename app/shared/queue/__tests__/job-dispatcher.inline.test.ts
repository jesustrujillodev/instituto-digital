import { describe, expect, test } from "vitest";
import type { Logger } from "../../logging/logger";
import { createInlineJobDispatcher } from "../job-dispatcher.inline";
import { JOB_NAMES } from "../queue.config";
import { createHandlersDouble } from "./job-handlers.double";

const RECALC = {
	courseId: 7,
	actorId: 3,
	at: "2026-10-06T18:00:00.000Z",
};

const createLogger = () => {
	const warnings: string[] = [];
	const logger = {
		warn: (message: string) => warnings.push(message),
		error: () => {},
		info: () => {},
		debug: () => {},
	} as unknown as Logger;
	return { logger, warnings };
};

describe("createInlineJobDispatcher", () => {
	test("el correo no se envía en línea: lo entrega el poller", async () => {
		const { handlers, ran } = createHandlersDouble();
		const { logger } = createLogger();

		await createInlineJobDispatcher({ handlers, logger }).dispatch(
			JOB_NAMES.deliverEmail,
			{ outboxId: 1, attempt: 0 },
		);

		expect(ran).toEqual([]);
	});

	// Sin cola el recálculo vuelve a ser parte del caso de uso: su error
	// revierte la transacción, como antes de existir la cola.
	test("el recálculo corre ya y su error llega al caso de uso", async () => {
		const { handlers, ran } = createHandlersDouble({ fails: true });
		const { logger } = createLogger();

		await expect(
			createInlineJobDispatcher({ handlers, logger }).dispatch(
				JOB_NAMES.recalculateProgress,
				RECALC,
			),
		).rejects.toThrow("recalculate-progress falló");
		expect(ran).toEqual([JOB_NAMES.recalculateProgress]);
	});

	test("un borrado que falla solo se registra", async () => {
		const { handlers, ran } = createHandlersDouble({ fails: true });
		const { logger, warnings } = createLogger();

		await createInlineJobDispatcher({ handlers, logger }).dispatch(
			JOB_NAMES.deleteObject,
			{ bucket: "b", key: "k" },
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(ran).toEqual([JOB_NAMES.deleteObject]);
		expect(warnings).toEqual(["background job failed"]);
	});
});
