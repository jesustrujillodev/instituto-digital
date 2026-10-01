import { redirect } from "react-router";
import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindEnrollmentCourse } from "../../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../../utils/enrollment-error-messages";
import { requireParticipant } from "../../require-participant.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-capacitaciones/:documentId
 *
 * Sin una inscripción que enseñar, la ficha que responde es la del catálogo:
 * ahí se decide si el curso se ve y si puede inscribirse.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { documentId } = validateFindEnrollmentCourse({
		documentId: params.documentId,
	});

	const [detail, classrooms, sessionMaterials] = await Promise.all([
		context.enrollmentService.findMyCourse(documentId, auth),
		context.classroomService.listMine(auth),
		context.sessionMaterialService.findForParticipant(documentId, auth),
	]);
	if (!detail.success) {
		throw toRouteError(detail.error, ENROLLMENT_ERROR_MESSAGES);
	}
	if (!classrooms.success) {
		throw toRouteError(classrooms.error, CONTENT_ERROR_MESSAGES);
	}
	if (!sessionMaterials.success) {
		throw toRouteError(sessionMaterials.error, CONTENT_ERROR_MESSAGES);
	}
	if (!detail.data) {
		throw redirect(`/dashboard/catalogo-de-capacitaciones/${documentId}`);
	}

	return ok({
		...detail.data,
		hasClassroom: classrooms.data.includes(documentId),
		sessionMaterials: sessionMaterials.data,
	});
};
