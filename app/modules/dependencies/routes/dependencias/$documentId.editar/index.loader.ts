import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { DEPENDENCY_ADMIN_ROLES } from "../../../domain/dependency.access";
import { validateFindDependency } from "../../../domain/dependency.validators";
import { DEPENDENCY_ERROR_MESSAGES } from "../../../utils/dependency-error-messages";
import type { Route } from "./+types/index";

export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	await requireRole(request, context, DEPENDENCY_ADMIN_ROLES);

	// La validación de frontera también aplica al parámetro de la URL: un
	// documentId que no es un uuid no llega al servicio.
	const { documentId } = validateFindDependency({
		documentId: params.documentId,
	});

	// En paralelo: la dependencia y su personal son consultas independientes, y
	// encadenarlas duplicaría la latencia de abrir la pantalla.
	const [dependency, candidates] = await Promise.all([
		context.dependencyService.findById(documentId),
		context.dependencyService.listHeadCandidates(documentId),
	]);

	if (!dependency.success) {
		throw toRouteError(dependency.error, DEPENDENCY_ERROR_MESSAGES);
	}
	if (!candidates.success) {
		throw toRouteError(candidates.error, DEPENDENCY_ERROR_MESSAGES);
	}

	return ok({ dependency: dependency.data, candidates: candidates.data });
};
