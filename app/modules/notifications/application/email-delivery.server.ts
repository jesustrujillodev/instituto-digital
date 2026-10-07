import type { Logger } from "@/shared/logging/logger";
import type { IMailer } from "@/shared/mail/mailer.port";
import type { JobDispatcher } from "@/shared/queue/job-dispatcher";
import { JOB_NAMES, OUTBOX_SWEEP_BATCH } from "@/shared/queue/queue.config";
import type { Clock } from "@/shared/time/clock";
import { OUTBOX_LEASE_MS } from "../domain/notification.config";
import type { INotificationRepository } from "../domain/notification.repository";
import {
	describeSendError,
	nextAttemptAfter,
} from "../domain/notification.rules";
import type { ClaimedMessage } from "../domain/notification.types";

export type SendOutcome = "sent" | "retried" | "failed";

interface SendDependencies {
	notificationRepository: INotificationRepository;
	mailer: IMailer;
	clock: Clock;
	logger: Logger;
}

/**
 * Envía un mensaje ya reservado y deja su fila en el estado que toca. El
 * horario de reintentos es siempre el de la fila (`RETRY_DELAYS_MIN`), la
 * entregue el poller o la cola.
 */
export const sendClaimed = async (
	message: ClaimedMessage,
	{ notificationRepository, mailer, clock, logger }: SendDependencies,
): Promise<SendOutcome> => {
	try {
		await mailer.send({
			to: message.recipient,
			subject: message.subject,
			text: message.text,
			html: message.html,
		});
		await notificationRepository.markSent(message.id, clock.now());
		return "sent";
	} catch (error) {
		const description = describeSendError(error);
		const retryAt = nextAttemptAfter(message.attempts, clock.now());

		if (retryAt) {
			await notificationRepository.markRetry(message.id, description, retryAt);
			return "retried";
		}
		await notificationRepository.markFailed(message.id, description);
		logger.error("email delivery failed permanently", {
			id: message.id,
			error: description,
		});
		return "failed";
	}
};

/**
 * Trabajo `deliver-email`: reserva la fila por id y la envía. Si otro ya la
 * tomó o ya salió, no hace nada: el trabajo puede llegar repetido.
 */
export const deliverOutboxMessage = async (
	{ outboxId }: { outboxId: number },
	deps: SendDependencies,
): Promise<void> => {
	const now = deps.clock.now();
	const message = await deps.notificationRepository.claimById({
		id: outboxId,
		now,
		leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
	});
	if (!message) return;

	await sendClaimed(message, deps);
};

/**
 * Trabajo `sweep-outbox`: encola lo vencido que no llegó a la cola (Redis
 * caído al encolar, un reintento cuyo horario ya llegó, un worker que murió
 * con el mensaje reservado).
 */
export const sweepOutbox = async ({
	notificationRepository,
	jobDispatcher,
	clock,
}: {
	notificationRepository: INotificationRepository;
	jobDispatcher: JobDispatcher;
	clock: Clock;
}): Promise<number> => {
	const due = await notificationRepository.findDispatchable({
		now: clock.now(),
		limit: OUTBOX_SWEEP_BATCH,
	});
	await Promise.all(
		due.map(({ id, attempts }) =>
			jobDispatcher.dispatch(JOB_NAMES.deliverEmail, {
				outboxId: id,
				attempt: attempts,
			}),
		),
	);
	return due.length;
};
