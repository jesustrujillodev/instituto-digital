import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { resolveAssetRef } from "@/shared/storage/public-url";
import { readViewMode, VIEW_MODE_SCREENS } from "@/shared/view-mode/view-mode";
import { canChooseOrganizer } from "../../domain/course.access";
import { COURSE_LIST_DEFAULTS } from "../../domain/course.config";
import { validateListCourses } from "../../domain/course.validators";
import { COURSE_ERROR_MESSAGES } from "../../utils/course-error-messages";
import { toCourseCards } from "../../utils/to-course-cards";
import { requireCourseScope } from "../require-course-scope.server";
import type { Route } from "./+types/index";

/** Entero positivo del query string, o `undefined` si no viene o es basura. */
const readNumber = (value: string | null) => {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** GET /dashboard/cursos — listado recortado por el alcance de quien lo pide. */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { scope } = await requireCourseScope(request, context);
	const isGlobal = canChooseOrganizer(scope);

	const { searchParams } = new URL(request.url);

	const filters = validateListCourses({
		page: readNumber(searchParams.get("page")) ?? COURSE_LIST_DEFAULTS.page,
		pageSize:
			readNumber(searchParams.get("pageSize")) ?? COURSE_LIST_DEFAULTS.pageSize,
		search: searchParams.get("search") || undefined,
		// El filtro por dependencia se SUMA al alcance; fuera del global ni se lee.
		dependency: isGlobal
			? searchParams.get("dependency") || undefined
			: undefined,
		status: searchParams.get("status") || undefined,
		modality: searchParams.get("modality") || undefined,
		access: searchParams.get("access") || undefined,
		sortBy: searchParams.get("sortBy") || undefined,
		sortDir: searchParams.get("sortDir") || undefined,
	});

	const [result, dependencies] = await Promise.all([
		context.courseService.list(filters, scope),
		isGlobal ? context.dependencyService.listCatalog() : Promise.resolve(null),
	]);

	if (!result.success) throw toRouteError(result.error, COURSE_ERROR_MESSAGES);
	if (dependencies && !dependencies.success) {
		throw toRouteError(dependencies.error, COURSE_ERROR_MESSAGES);
	}

	return ok(
		{
			courses: toCourseCards(result.data, (reference) =>
				resolveAssetRef(context.assetUrlResolver, reference),
			),
			canFilterByDependency: isGlobal,
			dependencies: dependencies?.success
				? dependencies.data.map(({ documentId, name }) => ({
						documentId,
						name,
					}))
				: [],
			filters: {
				search: filters.search ?? "",
				dependency: filters.dependency ?? "",
				status: filters.status ?? "",
				modality: filters.modality ?? "",
				access: filters.access ?? "",
				sortBy: filters.sortBy ?? "createdAt",
				sortDir: filters.sortDir ?? "desc",
			},
			view: readViewMode(
				request.headers.get("Cookie"),
				VIEW_MODE_SCREENS.courses,
			),
		},
		{ pagination: result.pagination },
	);
};
