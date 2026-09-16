import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { validateFindCourse } from "../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../utils/course-error-messages";
import {
	COURSE_INTENTS,
	type CourseActionData,
} from "../utils/parse-course-form-data";

/**
 * Publicar y cancelar, compartidos por el listado y la ficha.
 *
 * Los dos actions los ofrecen; escribirlos dos veces sería la forma de que un
 * día uno avise distinto que el otro.
 */
export async function runStatusIntent(
	intent: string | null,
	rawDocumentId: unknown,
	auth: AuthContext,
	context: Pick<ICradle, "courseService">,
): Promise<CourseActionData> {
	const input = parseInput(
		() => validateFindCourse({ documentId: rawDocumentId }).documentId,
	);
	if (!input.success) return localizeError(input, COURSE_ERROR_MESSAGES);

	switch (intent) {
		case COURSE_INTENTS.publish: {
			const result = await context.courseService.publish(input.data, auth);
			if (!result.success) return localizeError(result, COURSE_ERROR_MESSAGES);

			return ok(null, { message: "Curso publicado" });
		}
		case COURSE_INTENTS.cancel: {
			const result = await context.courseService.cancel(input.data, auth);
			if (!result.success) return localizeError(result, COURSE_ERROR_MESSAGES);

			return ok(null, { message: "Curso cancelado" });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
}
