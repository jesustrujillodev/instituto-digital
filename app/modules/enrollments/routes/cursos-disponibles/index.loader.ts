import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { AVAILABLE_LIST_DEFAULTS } from "../../domain/enrollment.config";
import { validateListAvailableCourses } from "../../domain/enrollment.validators";
import { ENROLLMENT_ERROR_MESSAGES } from "../../utils/enrollment-error-messages";
import { requireParticipant } from "../require-participant.server";
import type { Route } from "./+types/index";

const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** GET /dashboard/cursos-disponibles */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireParticipant(request, context);
	const { searchParams } = new URL(request.url);

	const filters = validateListAvailableCourses({
		page: readNumber(searchParams.get("page")) ?? AVAILABLE_LIST_DEFAULTS.page,
		pageSize:
			readNumber(searchParams.get("pageSize")) ??
			AVAILABLE_LIST_DEFAULTS.pageSize,
		search: searchParams.get("search") || undefined,
		modality: searchParams.get("modality") || undefined,
	});

	const result = await context.enrollmentService.listAvailable(filters, auth);
	if (!result.success) {
		throw toRouteError(result.error, ENROLLMENT_ERROR_MESSAGES);
	}

	return ok(
		{
			courses: result.data,
			filters: {
				search: filters.search ?? "",
				modality: filters.modality ?? "",
			},
		},
		{ pagination: result.pagination },
	);
};
