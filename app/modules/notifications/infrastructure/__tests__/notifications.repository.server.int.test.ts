import { afterEach, describe, expect, test } from "vitest";
import { prisma } from "@/core/db.server";
import type { OutboxMessage } from "../../domain/notification.types";
import { createNotificationRepository } from "../notifications.repository.server";

const repository = createNotificationRepository({ prisma });
const run = Date.now().toString(36);

const message = (index: number): OutboxMessage => ({
	template: "ACCOUNT_CREATED",
	recipient: `outbox-${run}-${index}@idc.test`,
	subject: `Aviso ${index}`,
	text: "texto",
	html: "<p>html</p>",
});

const SECOND = 1_000;
const later = (from: Date, ms: number) => new Date(from.getTime() + ms);

describe("outbox de correo contra Postgres", () => {
	afterEach(async () => {
		await prisma.emailOutbox.deleteMany({
			where: { recipient: { startsWith: `outbox-${run}-` } },
		});
	});

	test("claimById reserva una sola vez mientras dura la reserva", async () => {
		const [ref] = await repository.enqueue([message(1)]);
		const now = new Date();
		const lease = { id: ref.id, now, leaseUntil: later(now, 60 * SECOND) };

		const first = await repository.claimById(lease);
		const second = await repository.claimById(lease);

		expect(first).toMatchObject({ id: ref.id, attempts: 1 });
		expect(second).toBeNull();
	});

	test("claimById vuelve a reservar cuando la reserva vence y cuenta el intento", async () => {
		const [ref] = await repository.enqueue([message(1)]);
		const now = new Date();
		await repository.claimById({ id: ref.id, now, leaseUntil: now });

		const reclaimed = await repository.claimById({
			id: ref.id,
			now: later(now, SECOND),
			leaseUntil: later(now, 60 * SECOND),
		});

		expect(reclaimed).toMatchObject({ id: ref.id, attempts: 2 });
	});

	test("claimById no toma un mensaje ya enviado", async () => {
		const [ref] = await repository.enqueue([message(1)]);
		await repository.markSent(ref.id, new Date());
		const now = new Date();

		expect(
			await repository.claimById({
				id: ref.id,
				now,
				leaseUntil: later(now, 60 * SECOND),
			}),
		).toBeNull();
	});

	test("dos claimDue concurrentes nunca reservan el mismo mensaje", async () => {
		const refs = await repository.enqueue(
			Array.from({ length: 10 }, (_, index) => message(index)),
		);
		const now = new Date();
		const claim = () =>
			repository.claimDue({
				now,
				limit: 5,
				leaseUntil: later(now, 60 * SECOND),
			});

		const [left, right] = await Promise.all([claim(), claim()]);
		const leftIds = left.map((claimed) => claimed.id);
		const rightIds = right.map((claimed) => claimed.id);

		expect(leftIds.filter((id) => rightIds.includes(id))).toEqual([]);
		expect([...leftIds, ...rightIds].sort((a, b) => a - b)).toEqual(
			refs.map((ref) => ref.id),
		);
	});

	test("un reintento programado no vence antes de su hora", async () => {
		const [ref] = await repository.enqueue([message(1)]);
		const now = new Date();
		await repository.markRetry(ref.id, "smtp caído", later(now, 60 * SECOND));

		expect(
			await repository.findDispatchable({ now, limit: 100 }),
		).not.toContainEqual(expect.objectContaining({ id: ref.id }));
		expect(
			await repository.findDispatchable({
				now: later(now, 61 * SECOND),
				limit: 100,
			}),
		).toContainEqual(expect.objectContaining({ id: ref.id }));
	});

	test("los fallidos se listan sin el cuerpo y purgeSent solo borra enviados viejos", async () => {
		const [failed, sent, recent] = await repository.enqueue([
			message(1),
			message(2),
			message(3),
		]);
		const now = new Date();
		await repository.markFailed(failed.id, "buzón inexistente");
		await repository.markSent(sent.id, later(now, -2 * 60 * SECOND));
		await repository.markSent(recent.id, now);

		const [listed] = await repository.findFailed({ skip: 0, take: 1 });
		const purged = await repository.purgeSent(later(now, -60 * SECOND));

		expect(listed).toEqual({
			id: failed.id,
			template: "ACCOUNT_CREATED",
			recipient: message(1).recipient,
			attempts: 0,
			lastError: "buzón inexistente",
			createdAt: expect.any(Date),
		});
		expect(purged).toBe(1);
		expect(
			await prisma.emailOutbox.count({
				where: { id: { in: [sent.id, recent.id] } },
			}),
		).toBe(1);
	});
});
