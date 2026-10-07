import { createProgressRecalculation } from "@/modules/content/application/progress-recalculation.server";
import {
	deliverOutboxMessage,
	sweepOutbox,
} from "@/modules/notifications/application/email-delivery.server";
import { purgeCutoff } from "@/modules/notifications/domain/notification.rules";
import type { JobHandlers } from "../queue/job-dispatcher";
import { JOB_FAILURE_RETENTION_DAYS, JOB_NAMES } from "../queue/queue.config";
import { createDeleteObjectJob } from "../storage/delete-object.job.server";
import type { ICradle } from "./container.types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Qué hace cada trabajo, armado desde el cradle. Cada función resuelve sus
 * dependencias al ejecutarse, no al construirse: el dispatcher que la recibe
 * vive en el mismo cradle que los servicios que la usan.
 */
export const createJobHandlers = (cradle: ICradle): JobHandlers => {
	const log = () => cradle.logger.child({ module: "jobs" });
	const delivery = () => ({
		notificationRepository: cradle.notificationRepository,
		mailer: cradle.mailer,
		clock: cradle.clock,
		logger: log(),
	});

	return {
		[JOB_NAMES.deliverEmail]: (payload) =>
			deliverOutboxMessage(payload, delivery()),

		[JOB_NAMES.sweepOutbox]: async () => {
			const queued = await sweepOutbox({
				notificationRepository: cradle.notificationRepository,
				jobDispatcher: cradle.jobDispatcher,
				clock: cradle.clock,
			});
			if (queued > 0) log().info("outbox swept", { queued });
		},

		[JOB_NAMES.recalculateProgress]: (payload) =>
			createProgressRecalculation(cradle)(payload),

		[JOB_NAMES.deleteObject]: (payload) =>
			createDeleteObjectJob(cradle.storageProvider)(payload),

		[JOB_NAMES.purgeExpiredSessions]: async () => {
			const purged = await cradle.sessionRepository.deleteExpired();
			log().info("expired sessions purged", { purged });
		},

		[JOB_NAMES.purgeSentEmails]: async () => {
			const purged = await cradle.notificationRepository.purgeSent(
				purgeCutoff(cradle.clock.now()),
			);
			log().info("sent emails purged", { purged });
		},

		[JOB_NAMES.purgeJobFailures]: async () => {
			const before = new Date(
				cradle.clock.now().getTime() - JOB_FAILURE_RETENTION_DAYS * DAY_MS,
			);
			const purged = await cradle.jobFailureRepository.purgeBefore(before);
			log().info("job failures purged", { purged });
		},
	};
};
