import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import type { Logger } from "@/shared/logging/logger";
import type {
	ClaimedMessage,
	OutboxMessage,
} from "../../domain/notification.types";
import { drainOutbox } from "../email-outbox.worker.server";
import { createNotificationService } from "../notifications.service.server";

const NOW = new Date("2026-09-16T18:00:00.000Z");

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const recipient = (email: string) => ({
	email,
	firstName: null,
	lastName: null,
});

describe("notificationService.notify", () => {
	const createHarness = (enqueueFails?: Error) => {
		const enqueued: OutboxMessage[][] = [];
		const service = createNotificationService({
			notificationRepository: {
				enqueue: async (messages: OutboxMessage[]) => {
					if (enqueueFails) throw enqueueFails;
					enqueued.push(messages);
				},
			} as unknown as ICradle["notificationRepository"],
			appBaseUrl: "https://app.example.com",
			logger: silentLogger,
		});
		return { service, enqueued };
	};

	test("encola el correo ya redactado", async () => {
		const { service, enqueued } = createHarness();

		const result = await service.notify([
			{ template: "PASSWORD_RESET", to: recipient("ana@instituto.gob.mx") },
		]);

		expect(result).toMatchObject({ success: true, data: { queued: 1 } });
		expect(enqueued[0]).toMatchObject([
			{
				template: "PASSWORD_RESET",
				recipient: "ana@instituto.gob.mx",
				subject: "Tu contraseña fue restablecida",
			},
		]);
	});

	test("omite destinatarios inválidos y no llama a la base si no queda nadie", async () => {
		const { service, enqueued } = createHarness();

		const result = await service.notify([
			{ template: "PASSWORD_RESET", to: recipient("") },
		]);

		expect(result).toMatchObject({ success: true, data: { queued: 0 } });
		expect(enqueued).toEqual([]);
	});

	test("un fallo al encolar se devuelve en el envelope, no se lanza", async () => {
		const { service } = createHarness(new Error("db caída"));

		const result = await service.notify([
			{ template: "PASSWORD_RESET", to: recipient("ana@instituto.gob.mx") },
		]);

		expect(result.success).toBe(false);
	});
});

describe("drainOutbox", () => {
	const messageOf = (id: number, attempts = 1): ClaimedMessage => ({
		id,
		recipient: `persona-${id}@instituto.gob.mx`,
		subject: "Asunto",
		text: "Texto",
		html: "<p>Texto</p>",
		attempts,
	});

	const createHarness = (
		claimed: ClaimedMessage[],
		failFor: readonly string[] = [],
	) => {
		const log = {
			claims: [] as unknown[],
			sent: [] as number[],
			retried: [] as { id: number; error: string; at: Date }[],
			failed: [] as { id: number; error: string }[],
			delivered: [] as string[],
		};

		const notificationRepository = {
			claimDue: async (params: unknown) => {
				log.claims.push(params);
				return claimed;
			},
			markSent: async (id: number) => {
				log.sent.push(id);
			},
			markRetry: async (id: number, error: string, at: Date) => {
				log.retried.push({ id, error, at });
			},
			markFailed: async (id: number, error: string) => {
				log.failed.push({ id, error });
			},
			purgeSent: async () => 3,
		} as unknown as ICradle["notificationRepository"];

		const mailer = {
			send: async ({ to }: { to: string }) => {
				if (failFor.includes(to)) throw new Error("421 servicio no disponible");
				log.delivered.push(to);
			},
		};

		const run = () =>
			drainOutbox({
				notificationRepository,
				mailer,
				clock: { now: () => NOW },
				logger: silentLogger,
			});

		return { run, log };
	};

	test("envía lo reservado, lo marca enviado y purga", async () => {
		const { run, log } = createHarness([messageOf(1), messageOf(2)]);

		const summary = await run();

		expect(summary).toEqual({ sent: 2, retried: 0, failed: 0, purged: 3 });
		expect(log.sent).toEqual([1, 2]);
		expect(log.claims[0]).toEqual({
			now: NOW,
			limit: 20,
			leaseUntil: new Date(NOW.getTime() + 5 * 60 * 1000),
		});
	});

	test("un fallo programa el reintento y no detiene al resto del lote", async () => {
		const { run, log } = createHarness(
			[messageOf(1), messageOf(2)],
			["persona-1@instituto.gob.mx"],
		);

		const summary = await run();

		expect(summary).toMatchObject({ sent: 1, retried: 1 });
		expect(log.retried).toEqual([
			{
				id: 1,
				error: "421 servicio no disponible",
				at: new Date(NOW.getTime() + 60 * 1000),
			},
		]);
		expect(log.delivered).toEqual(["persona-2@instituto.gob.mx"]);
	});

	test("al agotar los reintentos queda FAILED", async () => {
		const { run, log } = createHarness(
			[messageOf(1, 6)],
			["persona-1@instituto.gob.mx"],
		);

		const summary = await run();

		expect(summary).toMatchObject({ failed: 1, retried: 0 });
		expect(log.failed).toEqual([
			{ id: 1, error: "421 servicio no disponible" },
		]);
	});
});
