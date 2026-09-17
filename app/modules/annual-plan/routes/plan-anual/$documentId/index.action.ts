import { requireScope } from "@/shared/auth/require-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import type { AppResponse } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { PLAN_ACCESS_ROLES } from "../../../domain/annual-plan.access";
import {
	validateFindPlan,
	validatePlanLine,
} from "../../../domain/annual-plan.validators";
import { ANNUAL_PLAN_ERROR_MESSAGES } from "../../../utils/annual-plan-error-messages";
import {
	PLAN_INTENTS,
	type PlanActionData,
	parsePlanFormData,
} from "../../../utils/parse-plan-form-data";
import type { Route } from "./+types/index";

const LINE_MESSAGES: Record<string, string> = {
	[PLAN_INTENTS.updateLine]: "Línea actualizada.",
	[PLAN_INTENTS.cancelLine]: "Línea cancelada.",
	[PLAN_INTENTS.reactivateLine]: "Línea reactivada.",
	[PLAN_INTENTS.deleteLine]: "Línea borrada.",
};

/** POST /dashboard/plan-anual/:documentId — alta y operaciones sobre líneas. */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<PlanActionData> => {
	const { auth } = await requireScope(request, context, PLAN_ACCESS_ROLES);
	const form = parsePlanFormData(await request.formData());
	const lineId = () =>
		validateFindPlan({ documentId: form.lineDocumentId }).documentId;
	const service = context.annualPlanService;

	const respond = (result: AppResponse<unknown>, message: string) =>
		result.success
			? ok(null, { message })
			: localizeError(result, ANNUAL_PLAN_ERROR_MESSAGES);

	switch (form.intent) {
		case PLAN_INTENTS.addLine: {
			const input = parseInput(() => ({
				planId: validateFindPlan(params).documentId,
				dto: validatePlanLine(form.payload),
			}));
			if (!input.success)
				return localizeError(input, ANNUAL_PLAN_ERROR_MESSAGES);

			return respond(
				await service.addLine(input.data.planId, input.data.dto, auth),
				"Línea agregada.",
			);
		}
		case PLAN_INTENTS.updateLine: {
			const input = parseInput(() => ({
				lineId: lineId(),
				dto: validatePlanLine(form.payload),
			}));
			if (!input.success)
				return localizeError(input, ANNUAL_PLAN_ERROR_MESSAGES);

			return respond(
				await service.updateLine(input.data.lineId, input.data.dto, auth),
				LINE_MESSAGES[form.intent],
			);
		}
		case PLAN_INTENTS.cancelLine:
		case PLAN_INTENTS.reactivateLine:
		case PLAN_INTENTS.deleteLine: {
			const input = parseInput(lineId);
			if (!input.success)
				return localizeError(input, ANNUAL_PLAN_ERROR_MESSAGES);

			const operation = {
				[PLAN_INTENTS.cancelLine]: service.cancelLine,
				[PLAN_INTENTS.reactivateLine]: service.reactivateLine,
				[PLAN_INTENTS.deleteLine]: service.deleteLine,
			}[form.intent];

			return respond(
				await operation(input.data, auth),
				LINE_MESSAGES[form.intent],
			);
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
