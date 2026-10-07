import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import { JOB_NAMES } from "@/shared/queue/queue.config";
import type { ClaimedMessage } from "../../domain/notification.types";
import {
	deliverOutboxMessage,
	sendClaimed,
	sweepOutbox,
} from "../email-delivery.server";

const NOW = new Date("2026-09-16T18:00:00.000Z");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const messageOf = (attempts = 1): ClaimedMessage => ({
	id: 7,
	recipient: "ana@instituto.gob.mx",
	subject: "Asunto",
	text: "Texto",
	html: "<p>Texto</p>",
	attempts,
});

const createHarness = (
	options: { claimed?: ClaimedMessage | null; mailerFails?: boolean } = {},
) => {
	const log = {
		claims: [] as unknown[],
		sent: [] as number[],
		retried: [] as { id: number; at: Date }[],
		failed: [] as number[],
		delivered: [] as string[],
	};

	const notificationRepository = {
		claimById: async (params: unknown) => {
			log.claims.push(params);
			return options.claimed === undefined ? messageOf() : options.claimed;
		},
		markSent: async (id: number) => {
			log.sent.push(id);
		},
		markRetry: async (id: number, _error: string, at: Date) => {
			log.retried.push({ id, at });
		},
		markFailed: async (id: number) => {
			log.failed.push(id);
		},
	} as unknown as ICradle["notificationRepository"];

	const mailer = {
		send: async ({ to }: { to: string }) => {
			if (options.mailerFails) throw new Error("421 servicio no disponible");
			log.delivered.push(to);
		},
	};

	const deps = {
		notificationRepository,
		mailer,
		clock: { now: () => NOW },
		logger: silentLogger,
	};
	return { deps, log };
};

describe("deliverOutboxMessage", () => {
	test("reserva la fila por id con su lease, la envía y la marca enviada", async () => {
		const { deps, log } = createHarness();

		await deliverOutboxMessage({ outboxId: 7 }, deps);

		expect(log.claims).toEqual([
			{ id: 7, now: NOW, leaseUntil: new Date("2026-09-16T18:05:00.000Z") },
		]);
		expect(log.delivered).toEqual(["ana@instituto.gob.mx"]);
		expect(log.sent).toEqual([7]);
	});

	// El trabajo puede llegar repetido: un barrido, un reintento de BullMQ.
	test("si otro ya la tomó o ya salió, no envía nada", async () => {
		const { deps, log } = createHarness({ claimed: null });

		await deliverOutboxMessage({ outboxId: 7 }, deps);

		expect(log.delivered).toEqual([]);
		expect(log.sent).toEqual([]);
	});

	test("un fallo deja el reintento en la fila y el trabajo termina", async () => {
		const { deps, log } = createHarness({ mailerFails: true });

		await expect(
			deliverOutboxMessage({ outboxId: 7 }, deps),
		).resolves.toBeUndefined();

		expect(log.retried).toEqual([
			{ id: 7, at: new Date("2026-09-16T18:01:00.000Z") },
		]);
	});
});

describe("sendClaimed", () => {
	test("al agotar los reintentos la fila queda FAILED", async () => {
		const { deps, log } = createHarness({ mailerFails: true });

		expect(await sendClaimed(messageOf(6), deps)).toBe("failed");
		expect(log.failed).toEqual([7]);
		expect(log.retried).toEqual([]);
	});
});

describe("sweepOutbox", () => {
	test("vuelve a encolar lo vencido con el jobId de su intento", async () => {
		const dispatched: unknown[] = [];
		const lookups: unknown[] = [];

		const queued = await sweepOutbox({
			notificationRepository: {
				findDispatchable: async (params: unknown) => {
					lookups.push(params);
					return [
						{ id: 3, attempts: 0 },
						{ id: 4, attempts: 2 },
					];
				},
			} as unknown as ICradle["notificationRepository"],
			jobDispatcher: {
				dispatch: async (name: string, payload: unknown) => {
					dispatched.push({ name, payload });
				},
			} as unknown as ICradle["jobDispatcher"],
			clock: { now: () => NOW },
		});

		expect(queued).toBe(2);
		expect(lookups).toEqual([{ now: NOW, limit: 500 }]);
		expect(dispatched).toEqual([
			{ name: JOB_NAMES.deliverEmail, payload: { outboxId: 3, attempt: 0 } },
			{ name: JOB_NAMES.deliverEmail, payload: { outboxId: 4, attempt: 2 } },
		]);
	});
});
