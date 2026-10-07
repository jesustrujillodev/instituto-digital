import type * as v from "valibot";
import type { FailedEmailRecord } from "@/modules/notifications/domain/notification.types";
import type { JobFailureEntry } from "@/shared/queue/job-failure.port";
import type { AppResponse } from "@/shared/response/response.types";
import type { operationsListRule } from "./operations.rules";

export type OperationsListDto = v.InferOutput<typeof operationsListRule>;

/** Una fila de la tabla: `id` en texto, que es lo que pide la tabla compartida. */
export interface FailedEmailRow extends Omit<FailedEmailRecord, "id"> {
	id: string;
}

export interface JobFailureRow extends Omit<JobFailureEntry, "id"> {
	id: string;
}

/** Lo que el panel de inicio cuenta de la entrega de fondo. */
export interface OperationsHealth {
	failedEmails: number;
	stuckEmails: number;
	recentJobFailures: number;
	windowDays: number;
}

export interface OperationsPage {
	page: number;
	pageSize: number;
}

export type FailedEmailListResponse = AppResponse<FailedEmailRow[]>;
export type JobFailureListResponse = AppResponse<JobFailureRow[]>;
