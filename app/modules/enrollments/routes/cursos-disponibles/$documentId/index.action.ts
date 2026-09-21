import { parseEnrollmentFormData } from "../../../utils/parse-enrollment-form-data";
import { runParticipantIntent } from "../../participant-intents.server";
import { requireParticipant } from "../../require-participant.server";
import type { Route } from "./+types/index";

/** POST /dashboard/cursos-disponibles/:documentId */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs) => {
	const auth = await requireParticipant(request, context);
	const form = parseEnrollmentFormData(await request.formData());

	return runParticipantIntent(form.intent, params.documentId, auth, context);
};
