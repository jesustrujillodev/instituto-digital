import {
	type CourseActionData,
	INTENT_FIELD,
} from "../../../utils/parse-course-form-data";
import { runStatusIntent } from "../../course-status-intents.server";
import { requireCourseScope } from "../../require-course-scope.server";
import type { Route } from "./+types/index";

/** POST /dashboard/cursos/:documentId — publicar o cancelar desde la ficha. */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<CourseActionData> => {
	const { auth } = await requireCourseScope(request, context);

	const intent = (await request.formData()).get(INTENT_FIELD);

	return runStatusIntent(
		typeof intent === "string" ? intent : null,
		params.documentId,
		auth,
		context,
	);
};
