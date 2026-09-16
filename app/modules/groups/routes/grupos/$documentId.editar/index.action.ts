import { requireScope } from "@/shared/auth/require-scope.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { GROUP_ACCESS_ROLES } from "../../../domain/group.access";
import {
	validateAddMembers,
	validateFindGroup,
	validateRemoveMember,
	validateUpdateGroup,
} from "../../../domain/group.validators";
import { GROUP_ERROR_MESSAGES } from "../../../utils/group-error-messages";
import {
	GROUP_INTENTS,
	type GroupActionData,
	parseGroupFormData,
} from "../../../utils/parse-group-form-data";
import type { Route } from "./+types/index";

/**
 * Tres mutaciones sobre el mismo grupo, separadas por intención: guardar sus
 * datos, agregar miembros y dar de baja a uno.
 *
 * Van juntas porque comparten pantalla y recurso; la pertenencia no es un campo
 * más del formulario porque no se guarda con él, se altera en el acto.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<GroupActionData> => {
	const { auth } = await requireScope(request, context, GROUP_ACCESS_ROLES);

	const { fields, lists, intent } = parseGroupFormData(
		await request.formData(),
	);

	if (intent === GROUP_INTENTS.addMembers) {
		const input = parseInput(() =>
			validateAddMembers({
				documentId: params.documentId,
				userDocumentIds: lists.userDocumentIds ?? [],
			}),
		);
		if (!input.success) return localizeError(input, GROUP_ERROR_MESSAGES);

		const result = await context.groupService.addMembers(
			input.data.documentId,
			input.data.userDocumentIds,
			auth,
		);
		if (!result.success) return localizeError(result, GROUP_ERROR_MESSAGES);

		return ok(null, {
			message:
				input.data.userDocumentIds.length === 1
					? "Miembro agregado"
					: `${input.data.userDocumentIds.length} miembros agregados`,
		});
	}

	if (intent === GROUP_INTENTS.removeMember) {
		const input = parseInput(() =>
			validateRemoveMember({
				documentId: params.documentId,
				userDocumentId: fields.userDocumentId,
			}),
		);
		if (!input.success) return localizeError(input, GROUP_ERROR_MESSAGES);

		const result = await context.groupService.removeMember(
			input.data.documentId,
			input.data.userDocumentId,
			auth,
		);
		if (!result.success) return localizeError(result, GROUP_ERROR_MESSAGES);

		return ok(null, { message: "Miembro dado de baja" });
	}

	const input = parseInput(() => ({
		documentId: validateFindGroup({ documentId: params.documentId }).documentId,
		dto: validateUpdateGroup(fields),
	}));
	if (!input.success) return localizeError(input, GROUP_ERROR_MESSAGES);

	const result = await context.groupService.update(
		input.data.documentId,
		input.data.dto,
		auth,
	);
	if (!result.success) return localizeError(result, GROUP_ERROR_MESSAGES);

	return ok(null, { message: "Grupo actualizado" });
};
