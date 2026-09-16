import type { CourseActionData } from "../../utils/parse-course-form-data";
import { INTENT_FIELD } from "../../utils/parse-course-form-data";
import { runStatusIntent } from "../course-status-intents.server";
import { requireCourseScope } from "../require-course-scope.server";
import type { Route } from "./+types/index";

/**
 * POST /dashboard/cursos — acciones de fila: publicar y cancelar.
 *
 * Se invocan con useFetcher, así que no navegan: al terminar solo revalidan el
 * loader. No hay borrado: cancelar conserva sesiones, capacitadores y audiencia.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<CourseActionData> => {
	// 🔒 El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta.
	const { auth } = await requireCourseScope(request, context);

	const formData = await request.formData();

	return runStatusIntent(
		formData.get(INTENT_FIELD) as string | null,
		formData.get("documentId"),
		auth,
		context,
	);
};
