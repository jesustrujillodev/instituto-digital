import { requireRole } from "@/shared/auth/require-role.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { TRAINER_ADMIN_ROLES } from "../../../domain/trainer.access";
import {
	validateFindTrainer,
	validateUpdateProfile,
} from "../../../domain/trainer.validators";
import {
	parseTrainerFormData,
	type TrainerActionData,
} from "../../../utils/parse-trainer-form-data";
import { TRAINER_ERROR_MESSAGES } from "../../../utils/trainer-error-messages";
import type { Route } from "./+types/index";

export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<TrainerActionData> => {
	const auth = await requireRole(request, context, TRAINER_ADMIN_ROLES);

	const { fields } = parseTrainerFormData(await request.formData());

	const input = parseInput(() => ({
		userDocumentId: validateFindTrainer({ userDocumentId: params.documentId })
			.userDocumentId,
		dto: validateUpdateProfile(fields),
	}));
	if (!input.success) return localizeError(input, TRAINER_ERROR_MESSAGES);

	const result = await context.trainerService.updateProfile(
		input.data.userDocumentId,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, TRAINER_ERROR_MESSAGES);

	return ok(null, { message: "Perfil de capacitador actualizado" });
};
