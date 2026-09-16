import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	validateFindEnrollmentCourse,
	validateSearchParticipants,
} from "../../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../../utils/enrollment-error-messages";
import { PERSON_SEARCH_PARAM } from "../../../utils/parse-enrollment-form-data";
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

	const { search } = validateSearchParticipants({
		search:
			new URL(request.url).searchParams.get(PERSON_SEARCH_PARAM) || undefined,
	});

	const candidates = detail.data.can.assign
		? await context.enrollmentService.listAssignCandidates(
				documentId,
				search,
				auth,
			)
		: null;
	if (candidates && !candidates.success) {
		throw toRouteError(candidates.error, ENROLLMENT_ERROR_MESSAGES);
	}

	return ok({
		...detail.data,
		candidates: candidates?.success ? candidates.data : [],
		personSearch: search ?? "",
	});
};
