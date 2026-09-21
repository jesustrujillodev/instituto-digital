import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateAssignParticipants,
	validateFindEnrollmentCourse,
	validateInviteParticipants,
} from "../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../utils/enrollment-error-messages";
import { batchMessage } from "../../utils/enrollment-labels";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	parseEnrollmentFormData,
} from "../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

/** POST /dashboard/cursos/:documentId/inscripciones — inscribir o invitar. */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<EnrollmentActionData> => {
	const { auth } = await requireCourseScope(request, context);
	const form = parseEnrollmentFormData(await request.formData());
	const documentId = () =>
		validateFindEnrollmentCourse({ documentId: params.documentId }).documentId;

	switch (form.intent) {
		case ENROLLMENT_INTENTS.invite: {
			const input = parseInput(() => ({
				documentId: documentId(),
				dto: validateInviteParticipants({
					userDocumentIds: form.userDocumentIds,
					groupDocumentIds: form.groupDocumentIds,
				}),
			}));
			if (!input.success)
				return localizeError(input, ENROLLMENT_ERROR_MESSAGES);

			const result = await context.enrollmentService.invite(
				input.data.documentId,
				input.data.dto,
				auth,
			);
			if (!result.success) {
				return localizeError(result, ENROLLMENT_ERROR_MESSAGES);
			}

			return ok(null, {
				message: batchMessage(result.data, {
					singular: "invitado",
					plural: "invitados",
				}),
			});
		}
		case ENROLLMENT_INTENTS.assign: {
			const input = parseInput(() => ({
				documentId: documentId(),
				dto: validateAssignParticipants({
					userDocumentIds: form.userDocumentIds,
					groupDocumentIds: form.groupDocumentIds,
				}),
			}));
			if (!input.success)
				return localizeError(input, ENROLLMENT_ERROR_MESSAGES);

			const result = await context.enrollmentService.assign(
				input.data.documentId,
				input.data.dto,
				auth,
			);
			if (!result.success) {
				return localizeError(result, ENROLLMENT_ERROR_MESSAGES);
			}

			return ok(null, {
				message: batchMessage(result.data, {
					singular: "inscrito",
					plural: "inscritos",
				}),
			});
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
