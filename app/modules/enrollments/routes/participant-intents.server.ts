import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { validateFindEnrollmentCourse } from "../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../utils/enrollment-error-messages";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
} from "../utils/parse-enrollment-form-data";

const PARTICIPANT_OPERATIONS = {
	[ENROLLMENT_INTENTS.enroll]: {
		method: "enroll",
		message: "Quedaste inscrito",
	},
	[ENROLLMENT_INTENTS.withdraw]: {
		method: "withdraw",
		message: "Te diste de baja del curso",
	},
	[ENROLLMENT_INTENTS.accept]: {
		method: "accept",
		message: "Invitación aceptada",
	},
	[ENROLLMENT_INTENTS.decline]: {
		method: "decline",
		message: "Invitación rechazada",
	},
} as const;

/** Inscribirse, darse de baja, aceptar y rechazar: compartido por el detalle y Mis cursos. */
export async function runParticipantIntent(
	intent: string | null,
	rawCourseDocumentId: unknown,
	auth: AuthContext,
	context: Pick<ICradle, "enrollmentService">,
): Promise<EnrollmentActionData> {
	const operation =
		intent && intent in PARTICIPANT_OPERATIONS
			? PARTICIPANT_OPERATIONS[intent as keyof typeof PARTICIPANT_OPERATIONS]
			: null;

	if (!operation) {
		return fail({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Acción no reconocida.",
		});
	}

	const input = parseInput(
		() =>
			validateFindEnrollmentCourse({ documentId: rawCourseDocumentId })
				.documentId,
	);
	if (!input.success) return localizeError(input, ENROLLMENT_ERROR_MESSAGES);

	const result = await context.enrollmentService[operation.method](
		input.data,
		auth,
	);
	if (!result.success) return localizeError(result, ENROLLMENT_ERROR_MESSAGES);

	return ok(null, { message: operation.message });
}
