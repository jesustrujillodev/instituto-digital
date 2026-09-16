import { requireRole } from "@/shared/auth/require-role.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { DEPENDENCY_ADMIN_ROLES } from "../../../domain/dependency.access";
import {
	validateAssignHead,
	validateFindDependency,
	validateUpdateDependency,
} from "../../../domain/dependency.validators";
import { DEPENDENCY_ERROR_MESSAGES } from "../../../utils/dependency-error-messages";
import {
	DEPENDENCY_INTENTS,
	type DependencyActionData,
	parseDependencyFormData,
} from "../../../utils/parse-dependency-form-data";
import type { Route } from "./+types/index";

/**
 * Dos mutaciones sobre la misma dependencia, separadas por intención: guardar
 * sus datos y designarle titular.
 *
 * Van juntas porque comparten pantalla y recurso; la designación no es un campo
 * más del formulario porque no es una edición sino un relevo, con efectos sobre
 * dos cuentas ajenas a la dependencia.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<DependencyActionData> => {
	await requireRole(request, context, DEPENDENCY_ADMIN_ROLES);

	const { fields, intent } = parseDependencyFormData(await request.formData());

	if (intent === DEPENDENCY_INTENTS.assignHead) {
		const input = parseInput(() =>
			validateAssignHead({
				documentId: params.documentId,
				userDocumentId: fields.userDocumentId,
			}),
		);
		if (!input.success) return localizeError(input, DEPENDENCY_ERROR_MESSAGES);

		const result = await context.dependencyService.assignHead(
			input.data.documentId,
			input.data.userDocumentId,
		);
		if (!result.success) {
			return localizeError(result, DEPENDENCY_ERROR_MESSAGES);
		}

		return ok(null, {
			message:
				"Titular designado. Se cerraron las sesiones afectadas para que el cambio de rol tenga efecto de inmediato.",
		});
	}

	const input = parseInput(() => ({
		documentId: validateFindDependency({ documentId: params.documentId })
			.documentId,
		dto: validateUpdateDependency(fields),
	}));
	if (!input.success) return localizeError(input, DEPENDENCY_ERROR_MESSAGES);

	const result = await context.dependencyService.update(
		input.data.documentId,
		input.data.dto,
	);
	if (!result.success) return localizeError(result, DEPENDENCY_ERROR_MESSAGES);

	return ok(null, { message: "Dependencia actualizada" });
};
