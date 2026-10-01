import { runRotateEnrollmentQr } from "@/modules/enrollment-qr/routes/rotate-enrollment-qr.server";
import { ENROLLMENT_QR_INTENTS } from "@/modules/enrollment-qr/utils/enrollment-qr-intents";
import {
	type CourseActionData,
	INTENT_FIELD,
} from "../../../utils/parse-course-form-data";
import { runStatusIntent } from "../../course-status-intents.server";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/** POST /dashboard/capacitaciones/:documentId — publicar, cancelar o generar el QR de inscripción. */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<CourseActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const intent = (await request.formData()).get(INTENT_FIELD);

	if (intent === ENROLLMENT_QR_INTENTS.rotate) {
		return runRotateEnrollmentQr(params.documentId, auth, context);
	}

	return runStatusIntent(
		typeof intent === "string" ? intent : null,
		params.documentId,
		auth,
		context,
	);
};
