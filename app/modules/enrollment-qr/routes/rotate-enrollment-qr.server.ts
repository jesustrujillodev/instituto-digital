import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import type { AppResponse } from "@/shared/response/response.types";
import { validateEnrollmentQrCourse } from "../domain/enrollment-qr.validators";
import { ENROLLMENT_QR_ERROR_MESSAGES } from "../utils/enrollment-qr-error-messages";

/** Genera o rota el QR de inscripción desde la ficha del curso, que lo monta. */
export async function runRotateEnrollmentQr(
	rawDocumentId: unknown,
	auth: AuthContext,
	context: Pick<ICradle, "enrollmentQrService">,
): Promise<AppResponse<null>> {
	const input = parseInput(
		() => validateEnrollmentQrCourse({ documentId: rawDocumentId }).documentId,
	);
	if (!input.success) return localizeError(input, ENROLLMENT_QR_ERROR_MESSAGES);

	const result = await context.enrollmentQrService.rotateToken(
		input.data,
		auth,
	);
	if (!result.success)
		return localizeError(result, ENROLLMENT_QR_ERROR_MESSAGES);

	return ok(null, { message: "Código QR de inscripción listo" });
}
