import { requireRole } from "@/shared/auth/require-role.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { TRAINER_ADMIN_ROLES } from "../../domain/trainer.access";
import {
	validateActivateProfile,
	validateFindTrainer,
} from "../../domain/trainer.validators";
import {
	INTENT_FIELD,
	parseTrainerFormData,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../../utils/parse-trainer-form-data";
import { TRAINER_ERROR_MESSAGES } from "../../utils/trainer-error-messages";
import type { Route } from "./+types/index";

/**
 * Activar el perfil sobre una cuenta interna, y desactivar o reactivar uno
 * existente.
 *
 * 🔒 El guard del action es POR ROL y no `canViewCatalog`: mirar el catálogo lo
 * puede hacer cualquier capacitador, modificarlo no.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<TrainerActionData> => {
	const auth = await requireRole(request, context, TRAINER_ADMIN_ROLES);

	const formData = await request.formData();
	const { fields } = parseTrainerFormData(formData);
	const intent = formData.get(INTENT_FIELD);

	if (intent === TRAINER_INTENTS.activate) {
		const input = parseInput(() => validateActivateProfile(fields));
		if (!input.success) return localizeError(input, TRAINER_ERROR_MESSAGES);

		const result = await context.trainerService.activateProfile(
			input.data,
			auth,
		);
		if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

		return ok(null, {
			message:
				"Perfil de capacitador activado. Se cerraron sus sesiones para que el cambio tenga efecto de inmediato.",
		});
	}

	const input = parseInput(
		() =>
			validateFindTrainer({ userDocumentId: fields.userDocumentId })
				.userDocumentId,
	);
	if (!input.success) return localizeError(input, TRAINER_ERROR_MESSAGES);

	switch (intent) {
		case TRAINER_INTENTS.deactivate: {
			const result = await context.trainerService.deactivateProfile(
				input.data,
				auth,
			);
			if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

			return ok(null, { message: "Perfil de capacitador desactivado" });
		}
		case TRAINER_INTENTS.reactivate: {
			const result = await context.trainerService.reactivateProfile(
				input.data,
				auth,
			);
			if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

			return ok(null, { message: "Perfil de capacitador reactivado" });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
