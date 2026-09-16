import { forbiddenRole } from "@/shared/auth/forbidden-role";
import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import {
	canAdministerTrainers,
	TRAINER_ADMIN_ROLES,
} from "../../../domain/trainer.access";
import { validateFindTrainer } from "../../../domain/trainer.validators";
import { TRAINER_ERROR_MESSAGES } from "../../../utils/trainer-error-messages";
import type { Route } from "./+types/index";

export const loader = async ({
	request,
	context,
	params,
}: Route.LoaderArgs) => {
	const auth = await requireRole(request, context, TRAINER_ADMIN_ROLES);
	if (!canAdministerTrainers(auth.role))
		throw forbiddenRole(TRAINER_ADMIN_ROLES);

	// La validación de frontera también aplica al parámetro de la URL: un
	// documentId que no es un uuid no llega al servicio.
	const { userDocumentId } = validateFindTrainer({
		userDocumentId: params.documentId,
	});

	const result = await context.trainerService.findByUser(userDocumentId);
	if (!result.success) {
		throw toRouteError(result.error, TRAINER_ERROR_MESSAGES);
	}

	return ok({ trainer: result.data });
};
