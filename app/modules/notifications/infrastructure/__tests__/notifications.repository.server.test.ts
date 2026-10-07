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
		finds: [] as Record<string, unknown>[],
		values: [] as unknown[][],
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
			$queryRaw: async (
				strings: TemplateStringsArray,
				...values: unknown[]
			) => {
				log.sql.push(strings.join("?"));
				log.values.push(values);
				return ids.map((id) => ({ id, attempts: 1 }));
			},
			emailOutbox: {
				createManyAndReturn: async (args: Record<string, unknown>) => {
					log.creates.push(args);
					return ids.map((id) => ({ id, attempts: 0 }));
				},
				findMany: async (args: Record<string, unknown>) => {
					log.finds.push(args);
					return ids.map((id) => ({ id, attempts: 0 }));
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

describe("notificationRepository.enqueue (con filas)", () => {
	test("devuelve id e intentos de cada fila creada", async () => {
		const { repository } = createHarness([8, 9]);

		const refs = await repository.enqueue([
			{
				template: "PASSWORD_RESET",
				recipient: "ana@instituto.gob.mx",
				subject: "s",
				text: "t",
				html: "h",
			},
		]);

		expect(refs).toEqual([
			{ id: 8, attempts: 0 },
			{ id: 9, attempts: 0 },
		]);
	});
});

describe("notificationRepository.claimById", () => {
	// Reservar y comprobar el estado van en el mismo UPDATE: dos workers con el
	// mismo trabajo no pueden enviar dos veces.
	test("reserva solo si sigue pendiente, vencido y libre", async () => {
		const { repository, log } = createHarness([4]);

		const claimed = await repository.claimById({
			id: 4,
			now: NOW,
			leaseUntil: LEASE,
		});

		expect(claimed).toMatchObject({ id: 4, attempts: 1 });
		expect(log.sql[0]).toContain("UPDATE");
		expect(log.sql[0]).toContain("status::text = 'PENDING'");
		expect(log.sql[0]).toContain("next_attempt_at <=");
		expect(log.sql[0]).toContain("locked_until IS NULL OR locked_until <");
		expect(log.sql[0]).toContain("attempts = attempts + 1");
		expect(log.values[0]).toEqual([LEASE, 4, NOW, NOW]);
	});

	test("devuelve null si otro ya la tomó o ya salió", async () => {
		const { repository } = createHarness([]);

		expect(
			await repository.claimById({ id: 4, now: NOW, leaseUntil: LEASE }),
		).toBeNull();
	});
});

describe("notificationRepository.findDispatchable", () => {
	test("busca pendientes vencidos sin reserva vigente", async () => {
		const { repository, log } = createHarness([4]);

		await repository.findDispatchable({ now: NOW, limit: 500 });

		expect(log.finds[0]).toMatchObject({
			where: {
				status: "PENDING",
				nextAttemptAt: { lte: NOW },
				OR: [{ lockedUntil: null }, { lockedUntil: { lt: NOW } }],
			},
			take: 500,
		});
	});
});
