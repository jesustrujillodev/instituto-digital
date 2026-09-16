import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateFindTeachingCourse,
	validateSaveAttendance,
	validateSaveResults,
} from "../../../domain/teaching.validators";
import {
	parseTeachingFormData,
	TEACHING_INTENTS,
	type TeachingActionData,
} from "../../../utils/parse-teaching-form-data";
import { TEACHING_ERROR_MESSAGES } from "../../../utils/teaching-error-messages";
import { plural } from "../../../utils/teaching-labels";
import { requireTeaching } from "../../require-teaching.server";
import type { Route } from "./+types/index";

const savedMessage = (affected: number, what: string) =>
	affected === 0
		? "No había cambios que guardar."
		: `${what}: ${plural(affected, "cambio", "cambios")}.`;

/** POST /dashboard/imparticion/:documentId — lista, resultados o cierre. */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<TeachingActionData> => {
	const auth = await requireTeaching(request, context);
	const form = parseTeachingFormData(await request.formData());
	const documentId = () => validateFindTeachingCourse(params).documentId;

	switch (form.intent) {
		case TEACHING_INTENTS.attendance: {
			const input = parseInput(() => ({
				documentId: documentId(),
				dto: validateSaveAttendance(form.payload),
			}));
			if (!input.success) return localizeError(input, TEACHING_ERROR_MESSAGES);

			const result = await context.teachingService.saveAttendance(
				input.data.documentId,
				input.data.dto,
				auth,
			);
			if (!result.success)
				return localizeError(result, TEACHING_ERROR_MESSAGES);

			return ok(null, {
				message: savedMessage(result.data.affected, "Lista guardada"),
			});
		}
		case TEACHING_INTENTS.results: {
			const input = parseInput(() => ({
				documentId: documentId(),
				dto: validateSaveResults(form.payload),
			}));
			if (!input.success) return localizeError(input, TEACHING_ERROR_MESSAGES);

			const result = await context.teachingService.saveResults(
				input.data.documentId,
				input.data.dto,
				auth,
			);
			if (!result.success)
				return localizeError(result, TEACHING_ERROR_MESSAGES);

			return ok(null, {
				message: savedMessage(result.data.affected, "Resultados guardados"),
			});
		}
		case TEACHING_INTENTS.finish: {
			const input = parseInput(documentId);
			if (!input.success) return localizeError(input, TEACHING_ERROR_MESSAGES);

			const result = await context.teachingService.finish(input.data, auth);
			if (!result.success)
				return localizeError(result, TEACHING_ERROR_MESSAGES);

			return ok(null, {
				message: `Curso finalizado: ${plural(result.data.completed, "persona completó", "personas completaron")} y se ${result.data.credits === 1 ? "otorgó 1 crédito" : `otorgaron ${result.data.credits} créditos`}.`,
			});
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
