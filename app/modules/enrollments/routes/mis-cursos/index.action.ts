import type { EnrollmentActionData } from "../../utils/parse-enrollment-form-data";
import { parseEnrollmentFormData } from "../../utils/parse-enrollment-form-data";
import { runParticipantIntent } from "../participant-intents.server";
import { requireParticipant } from "../require-participant.server";
import type { Route } from "./+types/index";

/** POST /dashboard/mis-cursos — aceptar, rechazar o darse de baja desde la lista. */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<EnrollmentActionData> => {
	const auth = await requireParticipant(request, context);
	const form = parseEnrollmentFormData(await request.formData());

	return runParticipantIntent(
		form.intent,
		form.courseDocumentId,
		auth,
		context,
	);
};
