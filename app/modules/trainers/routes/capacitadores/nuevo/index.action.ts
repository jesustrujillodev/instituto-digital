import { requireRole } from "@/shared/auth/require-role.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { TRAINER_ADMIN_ROLES } from "../../../domain/trainer.access";
import { validateCreateExternalTrainer } from "../../../domain/trainer.validators";
import {
	parseTrainerFormData,
	type TrainerActionData,
} from "../../../utils/parse-trainer-form-data";
import { TRAINER_ERROR_MESSAGES } from "../../../utils/trainer-error-messages";
import type { Route } from "./+types/index";

export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<TrainerActionData> => {
	const auth = await requireRole(request, context, TRAINER_ADMIN_ROLES);

	const { fields } = parseTrainerFormData(await request.formData());

	const input = parseInput(() => validateCreateExternalTrainer(fields));
	if (!input.success) return localizeError(input, TRAINER_ERROR_MESSAGES);

	const created = await context.trainerService.createExternal(input.data, auth);
	if (!created.success) return localizeError(created, TRAINER_ERROR_MESSAGES);

	// La contraseña se entrega por canal privado, como el resto de altas: el
	// correo de bienvenida llega con PRD-08.
	return ok(null, { message: "Capacitador externo registrado" });
};
