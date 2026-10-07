import type { ICradle } from "@/shared/di/container.types";
import { JOB_NAMES } from "@/shared/queue/queue.config";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { toOutboxMessage } from "../domain/notification.mapper";
import type { INotificationService } from "../domain/notification.service";
import { renderNotification } from "../domain/notification.templates";
import type { NotificationEvent } from "../domain/notification.types";
import { isDeliverable } from "../domain/notification.validators";

type Dependencies = {
	notificationRepository: ICradle["notificationRepository"];
	jobDispatcher: ICradle["jobDispatcher"];
	appBaseUrl: ICradle["appBaseUrl"];
	logger: ICradle["logger"];
};

export const createNotificationService = ({
	notificationRepository,
	jobDispatcher,
	appBaseUrl,
	logger,
}: Dependencies): INotificationService => {
	const log = logger.child({ module: "notifications" });
	const run = createOperationRunner(log);

	return {
		async notify(events: readonly NotificationEvent[]) {
			return run("notify", async () => {
				const deliverable = events.filter((event) => isDeliverable(event.to));
				if (deliverable.length < events.length) {
					log.warn("notification skipped: invalid recipient", {
						skipped: events.length - deliverable.length,
					});
				}
				if (deliverable.length === 0) return ok({ queued: 0 });

				const queued = await notificationRepository.enqueue(
					deliverable.map((event) =>
						toOutboxMessage(
							event,
							renderNotification(event, { appUrl: appBaseUrl }),
						),
					),
				);
				// La fila ya es el aviso; la cola solo lo entrega antes que el
				// barrido, y solo si la transacción se confirma.
				await Promise.all(
					queued.map(({ id, attempts }) =>
						jobDispatcher.dispatch(JOB_NAMES.deliverEmail, {
							outboxId: id,
							attempt: attempts,
						}),
					),
				);

				return ok({ queued: deliverable.length });
			});
		},
	};
};
