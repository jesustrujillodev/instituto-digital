import { requireRole } from "@/shared/auth/require-role.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { TRAINER_ADMIN_ROLES } from "../../../../domain/trainer.access";
import {
	validateActivateProfile,
	validateFindTrainer,
	validateUpdateProfile,
} from "../../../../domain/trainer.validators";
import {
	parseTrainerFormData,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../../../../utils/parse-trainer-form-data";
import { TRAINER_ERROR_MESSAGES } from "../../../../utils/trainer-error-messages";
import type { Route } from "./+types/index";

/**
 * Perfil de capacitador de una cuenta: habilitarlo, editarlo, deshabilitarlo y
 * volver a habilitarlo. Lo envían la tabla y el panel de `/dashboard/usuarios`.
 *
 * 🔒 El guard es por rol; alcance y rango sobre la cuenta los decide el
 * servicio con `canManageTrainer`, porque un externo no cae en ninguna
 * dependencia y el alcance del titular no lo alcanzaría.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<TrainerActionData> => {
	const auth = await requireRole(request, context, TRAINER_ADMIN_ROLES);

	const formData = await request.formData();
	const { fields, intent } = parseTrainerFormData(formData);

	const target = parseInput(
		() =>
			validateFindTrainer({ userDocumentId: params.documentId }).userDocumentId,
	);
	if (!target.success) return localizeError(target, TRAINER_ERROR_MESSAGES);

	const userDocumentId = target.data;

	switch (intent) {
		case TRAINER_INTENTS.activate: {
			const input = parseInput(() =>
				validateActivateProfile({ ...fields, userDocumentId }),
			);
			if (!input.success) return localizeError(input, TRAINER_ERROR_MESSAGES);

			const result = await context.trainerService.activateProfile(
				input.data,
				auth,
			);
			if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

			return ok(null, {
				message:
					"Capacitador habilitado. Su sesión se cerró para aplicar el cambio.",
			});
		}
		case TRAINER_INTENTS.update: {
			// Un campo vacío se descarta al parsear el formulario; la semblanza se
			// manda siempre, así que su ausencia aquí significa que se vació.
			const input = parseInput(() =>
				validateUpdateProfile({ ...fields, bio: fields.bio ?? null }),
			);
			if (!input.success) return localizeError(input, TRAINER_ERROR_MESSAGES);

			const result = await context.trainerService.updateProfile(
				userDocumentId,
				input.data,
				auth,
			);
			if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

			return ok(null, { message: "Perfil de capacitador actualizado" });
		}
		case TRAINER_INTENTS.deactivate: {
			const result = await context.trainerService.deactivateProfile(
				userDocumentId,
				auth,
			);
			if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

			return ok(null, {
				message:
					"Capacitador deshabilitado. Ya no se puede asignar a cursos; conserva lo que impartió.",
			});
		}
		case TRAINER_INTENTS.reactivate: {
			const result = await context.trainerService.reactivateProfile(
				userDocumentId,
				auth,
			);
			if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

			return ok(null, {
				message:
					"Capacitador habilitado de nuevo. Su sesión se cerró para aplicar el cambio.",
			});
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
