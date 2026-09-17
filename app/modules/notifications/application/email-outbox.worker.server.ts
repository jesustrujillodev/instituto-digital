import type { Logger } from "@/shared/logging/logger";
import type { IMailer } from "@/shared/mail/mailer.port";
import type { Clock } from "@/shared/time/clock";
import {
	OUTBOX_BATCH_SIZE,
	OUTBOX_LEASE_MS,
} from "../domain/notification.config";
import type { INotificationRepository } from "../domain/notification.repository";
import {
	describeSendError,
	nextAttemptAfter,
	purgeCutoff,
} from "../domain/notification.rules";
import type { DrainSummary } from "../domain/notification.types";

interface DrainDependencies {
	notificationRepository: INotificationRepository;
	mailer: IMailer;
	clock: Clock;
	logger: Logger;
	batchSize?: number;
}

/**
 * Una pasada del worker: envía lo vencido y purga lo viejo.
 *
 * Cada mensaje se resuelve por separado: uno que falla no detiene al resto del
 * lote.
 */
export const drainOutbox = async ({
	notificationRepository,
	mailer,
	clock,
	logger,
	batchSize = OUTBOX_BATCH_SIZE,
}: DrainDependencies): Promise<DrainSummary> => {
	const now = clock.now();
	const summary: DrainSummary = { sent: 0, retried: 0, failed: 0, purged: 0 };

	const messages = await notificationRepository.claimDue({
		now,
		limit: batchSize,
		leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
	});

	for (const message of messages) {
		try {
			await mailer.send({
				to: message.recipient,
				subject: message.subject,
				text: message.text,
				html: message.html,
			});
			await notificationRepository.markSent(message.id, clock.now());
			summary.sent += 1;
		} catch (error) {
			const description = describeSendError(error);
			const retryAt = nextAttemptAfter(message.attempts, clock.now());

			if (retryAt) {
				await notificationRepository.markRetry(
					message.id,
					description,
					retryAt,
				);
				summary.retried += 1;
			} else {
				await notificationRepository.markFailed(message.id, description);
				summary.failed += 1;
				logger.error("email delivery failed permanently", {
					id: message.id,
					error: description,
				});
			}
		}
	}

	summary.purged = await notificationRepository.purgeSent(purgeCutoff(now));

	return summary;
};

const WORKER_KEY = Symbol.for("instituto-digital.email-outbox-worker");

type GlobalWithWorker = typeof globalThis & {
	[WORKER_KEY]?: ReturnType<typeof setInterval>;
};

/**
 * Arranca el worker del proceso. Idempotente: la recarga en caliente vuelve a
 * evaluar el contenedor y no debe dejar dos intervalos enviando. Una pasada
 * nunca se solapa con la anterior.
 */
export const startEmailOutboxWorker = ({
	drain,
	intervalMs,
	logger,
}: {
	drain: () => Promise<DrainSummary>;
	intervalMs: number;
	logger: Logger;
}): void => {
	const scope = globalThis as GlobalWithWorker;
	if (scope[WORKER_KEY]) clearInterval(scope[WORKER_KEY]);

	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			const summary = await drain();
			if (summary.sent + summary.retried + summary.failed > 0) {
				logger.info("email outbox drained", { ...summary });
			}
		} catch (error) {
			logger.error("email outbox drain crashed", {
				message: error instanceof Error ? error.message : String(error),
			});
		} finally {
			running = false;
		}
	};

	const timer = setInterval(tick, intervalMs);
	timer.unref?.();
	scope[WORKER_KEY] = timer;
};
