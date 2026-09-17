import { requireScope } from "@/shared/auth/require-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { PLAN_ACCESS_ROLES } from "../../domain/annual-plan.access";
import { validateCreatePlan } from "../../domain/annual-plan.validators";
import { ANNUAL_PLAN_ERROR_MESSAGES } from "../../utils/annual-plan-error-messages";
import {
	PLAN_INTENTS,
	type PlanActionData,
	parsePlanFormData,
} from "../../utils/parse-plan-form-data";
import type { Route } from "./+types/index";

/** POST /dashboard/plan-anual — crear el plan de un ejercicio. */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<PlanActionData> => {
	const { auth } = await requireScope(request, context, PLAN_ACCESS_ROLES);
	const form = parsePlanFormData(await request.formData());

	if (form.intent !== PLAN_INTENTS.createPlan) {
		return fail({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Acción no reconocida.",
		});
	}

	const input = parseInput(() =>
		validateCreatePlan({ fiscalYear: form.fiscalYear }),
	);
	if (!input.success) return localizeError(input, ANNUAL_PLAN_ERROR_MESSAGES);

	const result = await context.annualPlanService.createPlan(input.data, auth);
	if (!result.success) return localizeError(result, ANNUAL_PLAN_ERROR_MESSAGES);

	return ok(null, { message: `Plan ${input.data.fiscalYear} creado.` });
};
