import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import {
	JOB_FAILURE_WINDOW_DAYS,
	STUCK_EMAIL_MINUTES,
} from "../domain/operations.config";
import { toFailedEmailRow, toJobFailureRow } from "../domain/operations.mapper";
import { pageWindowOf } from "../domain/operations.rules";
import type { IOperationsService } from "../domain/operations.service";
import type { OperationsPage } from "../domain/operations.types";

type Dependencies = {
	notificationRepository: ICradle["notificationRepository"];
	jobFailureRepository: ICradle["jobFailureRepository"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const createOperationsService = ({
	notificationRepository,
	jobFailureRepository,
	clock,
	logger,
}: Dependencies): IOperationsService => {
	const run = createOperationRunner(logger.child({ module: "operations" }));

	return {
		async summarizeHealth() {
			return run("summarizeHealth", async () => {
				const now = clock.now().getTime();

				const [failedEmails, stuckEmails, recentJobFailures] =
					await Promise.all([
						notificationRepository.countFailed(),
						notificationRepository.countStuck(
							new Date(now - STUCK_EMAIL_MINUTES * MINUTE_MS),
						),
						jobFailureRepository.countSince(
							new Date(now - JOB_FAILURE_WINDOW_DAYS * DAY_MS),
						),
					]);

				return ok({
					failedEmails,
					stuckEmails,
					recentJobFailures,
					windowDays: JOB_FAILURE_WINDOW_DAYS,
				});
			});
		},

		async listFailedEmails(page: OperationsPage) {
			return run("listFailedEmails", async () => {
				const [rows, total] = await Promise.all([
					notificationRepository.findFailed(pageWindowOf(page)),
					notificationRepository.countFailed(),
				]);

				return ok(rows.map(toFailedEmailRow), {
					pagination: toPaginationMeta({ ...page, total }),
				});
			});
		},

		async listJobFailures(page: OperationsPage) {
			return run("listJobFailures", async () => {
				const [rows, total] = await Promise.all([
					jobFailureRepository.findPage(pageWindowOf(page)),
					jobFailureRepository.count(),
				]);

				return ok(rows.map(toJobFailureRow), {
					pagination: toPaginationMeta({ ...page, total }),
				});
			});
		},
	};
};
