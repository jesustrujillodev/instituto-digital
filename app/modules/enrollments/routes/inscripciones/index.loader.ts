import { requireCourseScope } from "@/modules/courses/routes/require-course-scope.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	validateFindEnrollmentCourse,
	validateSearchParticipants,
} from "../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../utils/enrollment-error-messages";
import { PERSON_SEARCH_PARAM } from "../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

/** GET /dashboard/cursos/:documentId/inscripciones — lista de inscritos e invitados. */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const { auth } = await requireCourseScope(request, context);
	const { documentId } = validateFindEnrollmentCourse({
		documentId: params.documentId,
	});
	const { search } = validateSearchParticipants({
		search:
			new URL(request.url).searchParams.get(PERSON_SEARCH_PARAM) || undefined,
	});

	const roster = await context.enrollmentService.listRoster(documentId, auth);
	if (!roster.success) {
		throw toRouteError(roster.error, ENROLLMENT_ERROR_MESSAGES);
	}

	const options = roster.data.course.isOpen
		? await context.enrollmentService.listRosterOptions(
				documentId,
				search,
				auth,
			)
		: null;
	if (options && !options.success) {
		throw toRouteError(options.error, ENROLLMENT_ERROR_MESSAGES);
	}

	return ok({
		...roster.data,
		options: options?.success ? options.data : null,
		personSearch: search ?? "",
	});
};
