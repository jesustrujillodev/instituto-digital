import { describe, expect, test } from "vitest";
import type { ICradle } from "@/shared/di/container.types";
import { createNotificationRepository } from "../notifications.repository.server";

const NOW = new Date("2026-09-16T18:00:00.000Z");
const LEASE = new Date("2026-09-16T18:05:00.000Z");

const createHarness = (ids: number[] = [4, 5]) => {
	const log = {
		sql: [] as string[],
		updates: [] as Record<string, unknown>[],
		creates: [] as Record<string, unknown>[],
		transactions: 0,
	};

	const tx = {
		$queryRaw: async (strings: TemplateStringsArray) => {
			log.sql.push(strings.join("?"));
			return ids.map((id) => ({ id }));
		},
		emailOutbox: {
			updateMany: async (args: Record<string, unknown>) => {
				log.updates.push(args);
			},
			findMany: async () => ids.map((id) => ({ id })),
		},
	};

	const repository = createNotificationRepository({
		prisma: {
			$transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
				log.transactions += 1;
				return work(tx);
			},
			emailOutbox: {
				createMany: async (args: Record<string, unknown>) => {
					log.creates.push(args);
				},
			},
		} as unknown as ICradle["prisma"],
	});

	return { repository, log };
};

describe("notificationRepository.claimDue", () => {
	test("reserva con SKIP LOCKED y cuenta el intento en la misma transacción", async () => {
		const { repository, log } = createHarness();

		const claimed = await repository.claimDue({
			now: NOW,
			limit: 20,
			leaseUntil: LEASE,
		});

		expect(claimed).toHaveLength(2);
		expect(log.transactions).toBe(1);
		expect(log.sql[0]).toContain("FOR UPDATE SKIP LOCKED");
		expect(log.sql[0]).toContain("locked_until IS NULL OR locked_until <");
		expect(log.updates).toEqual([
			{
				where: { id: { in: [4, 5] } },
				data: { lockedUntil: LEASE, attempts: { increment: 1 } },
			},
		]);
	});

	test("sin mensajes vencidos no escribe nada", async () => {
		const { repository, log } = createHarness([]);

		expect(
			await repository.claimDue({ now: NOW, limit: 20, leaseUntil: LEASE }),
		).toEqual([]);
		expect(log.updates).toEqual([]);
	});
});

describe("notificationRepository.enqueue", () => {
	test("un lote vacío no llega a la base", async () => {
		const { repository, log } = createHarness();

		await repository.enqueue([]);

		expect(log.creates).toEqual([]);
	});
});
