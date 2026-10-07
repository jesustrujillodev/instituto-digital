import type { AppResponse } from "@/shared/response/response.types";
import type {
	FailedEmailListResponse,
	JobFailureListResponse,
	OperationsHealth,
	OperationsPage,
} from "./operations.types";

/**
 * Lo que la entrega de fondo no pudo completar. Solo lectura: no reintenta ni
 * reencola. La autorización es del adaptador de entrada.
 */
export interface IOperationsService {
	summarizeHealth(): Promise<AppResponse<OperationsHealth>>;
	listFailedEmails(page: OperationsPage): Promise<FailedEmailListResponse>;
	listJobFailures(page: OperationsPage): Promise<JobFailureListResponse>;
}
