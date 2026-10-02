import { CONTENT_ERROR_MESSAGES } from "@/modules/content/utils/content-error-messages";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindEnrollmentCourse } from "../../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../../utils/enrollment-error-messages";
import { requireParticipant } from "../../require-participant.server";
import type { Route } from "./+types/index";

/** GET /dashboard/catalogo-de-capacitaciones/:documentId — 404 si quien pregunta no puede verlo. */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { documentId } = validateFindEnrollmentCourse({
		documentId: params.documentId,
	});

	const [detail, classrooms] = await Promise.all([
		context.enrollmentService.findAvailable(documentId, auth),
		context.classroomService.listMine(auth),
	]);
	if (!detail.success) {
		throw toRouteError(detail.error, ENROLLMENT_ERROR_MESSAGES);
	}
	if (!classrooms.success) {
		throw toRouteError(classrooms.error, CONTENT_ERROR_MESSAGES);
	}

	return ok({
		...detail.data,
		/** Inscrito y con aula abierta: el mismo criterio que «Mis cursos». */
		hasClassroom: classrooms.data.includes(documentId),
		now: context.clock.now(),
	});
};
