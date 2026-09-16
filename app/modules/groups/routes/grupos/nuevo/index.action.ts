import { requireScope } from "@/shared/auth/require-scope.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { GROUP_ACCESS_ROLES } from "../../../domain/group.access";
import { validateCreateGroup } from "../../../domain/group.validators";
import { GROUP_ERROR_MESSAGES } from "../../../utils/group-error-messages";
import {
	type GroupActionData,
	parseGroupFormData,
} from "../../../utils/parse-group-form-data";
import type { Route } from "./+types/index";

export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<GroupActionData> => {
	const { auth } = await requireScope(request, context, GROUP_ACCESS_ROLES);

	const { fields } = parseGroupFormData(await request.formData());

	const input = parseInput(() => validateCreateGroup(fields));
	if (!input.success) return localizeError(input, GROUP_ERROR_MESSAGES);

	// La dependencia no viaja en el formulario: la pone el alcance de quien crea.
	const created = await context.groupService.create(input.data, auth);
	if (!created.success) return localizeError(created, GROUP_ERROR_MESSAGES);

	return ok(null, { message: "Grupo creado" });
};
