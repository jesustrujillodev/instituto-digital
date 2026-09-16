import { requireParticipant } from "@/modules/enrollments/routes/require-participant.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { validateMyCreditsQuery } from "../../domain/credit.validators";
import { CREDIT_ERROR_MESSAGES } from "../../utils/credit-error-messages";
import { CREDIT_PARAMS, readPositiveInt } from "../../utils/credit-params";
import type { Route } from "./+types/index";

/** GET /dashboard/mis-creditos */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { searchParams } = new URL(request.url);

	const input = parseInput(() =>
		validateMyCreditsQuery({
			fiscalYear: readPositiveInt(searchParams.get(CREDIT_PARAMS.fiscalYear)),
		}),
	);
	if (!input.success) throw toRouteError(input.error, CREDIT_ERROR_MESSAGES);

	const result = await context.creditService.listMine(input.data, auth);
	if (!result.success) throw toRouteError(result.error, CREDIT_ERROR_MESSAGES);

	return ok(result.data);
};
