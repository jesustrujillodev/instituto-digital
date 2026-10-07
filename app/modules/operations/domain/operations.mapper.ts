import type { FailedEmailRecord } from "@/modules/notifications/domain/notification.types";
import type { JobFailureEntry } from "@/shared/queue/job-failure.port";
import type { FailedEmailRow, JobFailureRow } from "./operations.types";

export const toFailedEmailRow = (
	record: FailedEmailRecord,
): FailedEmailRow => ({
	...record,
	id: String(record.id),
});

export const toJobFailureRow = (entry: JobFailureEntry): JobFailureRow => ({
	...entry,
	id: String(entry.id),
});
