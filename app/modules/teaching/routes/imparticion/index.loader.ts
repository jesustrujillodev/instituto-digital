import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { TEACHING_LIST_DEFAULTS } from "../../domain/teaching.config";
import { validateListTeachingCourses } from "../../domain/teaching.validators";
import { TEACHING_ERROR_MESSAGES } from "../../utils/teaching-error-messages";
import { requireTeaching } from "../require-teaching.server";
import type { Route } from "./+types/index";

const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** GET /dashboard/imparticion — cursos publicados y finalizados que imparte u organiza. */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireTeaching(request, context);
	const { searchParams } = new URL(request.url);

	const input = parseInput(() =>
		validateListTeachingCourses({
			page: readNumber(searchParams.get("page")) ?? TEACHING_LIST_DEFAULTS.page,
			pageSize:
				readNumber(searchParams.get("pageSize")) ??
				TEACHING_LIST_DEFAULTS.pageSize,
			search: searchParams.get("search") || undefined,
			status: searchParams.get("status") || undefined,
		}),
	);
	if (!input.success) throw toRouteError(input.error, TEACHING_ERROR_MESSAGES);

	const result = await context.teachingService.listCourses(input.data, auth);
	if (!result.success)
		throw toRouteError(result.error, TEACHING_ERROR_MESSAGES);

	return ok(
		{
			courses: result.data,
			filters: {
				search: input.data.search ?? "",
				status: input.data.status ?? "",
			},
		},
		{ pagination: result.pagination },
	);
};
