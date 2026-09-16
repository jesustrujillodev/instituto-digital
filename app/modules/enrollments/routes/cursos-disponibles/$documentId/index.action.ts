import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import {
	validateAssignParticipants,
	validateFindEnrollmentCourse,
} from "../../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../../utils/enrollment-error-messages";
import { batchMessage } from "../../../utils/enrollment-labels";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	parseEnrollmentFormData,
} from "../../../utils/parse-enrollment-form-data";
import { runParticipantIntent } from "../../participant-intents.server";
import { requireParticipant } from "../../require-participant.server";
import type { Route } from "./+types/index";

/** POST /dashboard/cursos-disponibles/:documentId */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<EnrollmentActionData> => {
	const auth = await requireParticipant(request, context);
	const form = parseEnrollmentFormData(await request.formData());

	if (form.intent !== ENROLLMENT_INTENTS.assign) {
		return runParticipantIntent(form.intent, params.documentId, auth, context);
	}

	const input = parseInput(() => ({
		documentId: validateFindEnrollmentCourse({ documentId: params.documentId })
			.documentId,
		dto: validateAssignParticipants({
			userDocumentIds: form.userDocumentIds,
		}),
	}));
	if (!input.success) return localizeError(input, ENROLLMENT_ERROR_MESSAGES);

	const result = await context.enrollmentService.assign(
		input.data.documentId,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, ENROLLMENT_ERROR_MESSAGES);

	return ok(null, {
		message: batchMessage(result.data, {
			singular: "asignado",
			plural: "asignados",
		}),
	});
};
