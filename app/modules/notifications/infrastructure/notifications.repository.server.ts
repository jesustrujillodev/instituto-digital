import type { ICradle } from "@/shared/di/container.types";
import type { INotificationRepository } from "../domain/notification.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

export const createNotificationRepository = ({
	prisma,
}: Dependencies): INotificationRepository => ({
	async enqueue(messages) {
		if (messages.length === 0) return;

		await prisma.emailOutbox.createMany({
			data: messages.map((message) => ({ ...message })),
		});
	},

	async claimDue({ now, limit, leaseUntil }) {
		// La reserva va en su propia transacción corta: el bloqueo solo tiene que
		// durar lo que tarda en escribirse `locked_until`, no el envío.
		return prisma.$transaction(async (tx) => {
			const rows = await tx.$queryRaw<{ id: number }[]>`
				SELECT id FROM "org"."email_outbox"
				WHERE status::text = 'PENDING'
					AND next_attempt_at <= ${now}
					AND (locked_until IS NULL OR locked_until < ${now})
				ORDER BY id
				LIMIT ${limit}
				FOR UPDATE SKIP LOCKED`;
			if (rows.length === 0) return [];

			const ids = rows.map((row) => row.id);
			await tx.emailOutbox.updateMany({
				where: { id: { in: ids } },
				data: { lockedUntil: leaseUntil, attempts: { increment: 1 } },
			});

			return tx.emailOutbox.findMany({
				where: { id: { in: ids } },
				orderBy: { id: "asc" },
				select: {
					id: true,
					recipient: true,
					subject: true,
					text: true,
					html: true,
					attempts: true,
				},
			});
		});
	},

	async markSent(id, at) {
		await prisma.emailOutbox.update({
			where: { id },
			data: { status: "SENT", sentAt: at, lockedUntil: null, lastError: null },
		});
	},

	async markRetry(id, error, nextAttemptAt) {
		await prisma.emailOutbox.update({
			where: { id },
			data: { lastError: error, nextAttemptAt, lockedUntil: null },
		});
	},

	async markFailed(id, error) {
		await prisma.emailOutbox.update({
			where: { id },
			data: { status: "FAILED", lastError: error, lockedUntil: null },
		});
	},

	async purgeSent(before) {
		const { count } = await prisma.emailOutbox.deleteMany({
			where: { status: "SENT", sentAt: { lt: before } },
		});
		return count;
	},
});
