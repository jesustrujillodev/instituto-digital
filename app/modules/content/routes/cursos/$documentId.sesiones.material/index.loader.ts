import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { validateFindSessionMaterials } from "../../../domain/content.validators";
import { CONTENT_ERROR_MESSAGES } from "../../../utils/content-error-messages";
import { requireSessionMaterialScope } from "../../require-session-material.server";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/capacitaciones/:documentId/sesiones/material
 *
 * El material de todas las sesiones del curso, ya firmado para abrirse.
 */
export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireSessionMaterialScope(request, context);
	const { documentId } = validateFindSessionMaterials({
		documentId: params.documentId,
	});

	const board = await context.sessionMaterialService.findBoard(
		documentId,
		auth,
	);
	if (!board.success) throw toRouteError(board.error, CONTENT_ERROR_MESSAGES);

	return ok(board.data);
};
