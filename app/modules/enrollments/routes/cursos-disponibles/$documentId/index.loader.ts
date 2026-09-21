import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindEnrollmentCourse } from "../../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../../utils/enrollment-error-messages";
import { requireParticipant } from "../../require-participant.server";
import type { Route } from "./+types/index";

/** GET /dashboard/cursos-disponibles/:documentId — 404 si quien pregunta no puede verlo. */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { documentId } = validateFindEnrollmentCourse({
		documentId: params.documentId,
	});

	const detail = await context.enrollmentService.findAvailable(
		documentId,
		auth,
	);
	if (!detail.success) {
		throw toRouteError(detail.error, ENROLLMENT_ERROR_MESSAGES);
	}

	return ok(detail.data);
};
