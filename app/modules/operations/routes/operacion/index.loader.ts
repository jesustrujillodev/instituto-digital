import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import {
	OPERATIONS_LIST_DEFAULTS,
	OPERATIONS_ROLES,
} from "../../domain/operations.config";
import { validateOperationsList } from "../../domain/operations.validators";
import { OPERATIONS_ERROR_MESSAGES } from "../../utils/operations-error-messages";
import type { Route } from "./+types/index";

const numberOf = (value: string | null, fallback: number) =>
	value === null || value === "" ? fallback : Number(value);

/** GET /dashboard/operacion — correos y trabajos que agotaron sus intentos. */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	await requireRole(request, context, OPERATIONS_ROLES);
	const { searchParams } = new URL(request.url);

	const input = parseInput(() =>
		validateOperationsList({
			tab: searchParams.get("tab") || OPERATIONS_LIST_DEFAULTS.tab,
			page: numberOf(searchParams.get("page"), OPERATIONS_LIST_DEFAULTS.page),
			pageSize: numberOf(
				searchParams.get("pageSize"),
				OPERATIONS_LIST_DEFAULTS.pageSize,
			),
		}),
	);
	if (!input.success)
		throw toRouteError(input.error, OPERATIONS_ERROR_MESSAGES);

	const { tab, ...page } = input.data;

	// Solo se lee la pestaña que se pinta.
	if (tab === "jobs") {
		const jobs = await context.operationsService.listJobFailures(page);
		if (!jobs.success)
			throw toRouteError(jobs.error, OPERATIONS_ERROR_MESSAGES);

		return ok(
			{ tab, emails: [], jobs: jobs.data },
			{ pagination: jobs.pagination },
		);
	}

	const emails = await context.operationsService.listFailedEmails(page);
	if (!emails.success) {
		throw toRouteError(emails.error, OPERATIONS_ERROR_MESSAGES);
	}

	return ok(
		{ tab, emails: emails.data, jobs: [] },
		{ pagination: emails.pagination },
	);
};
