import { requireRole } from "@/shared/auth/require-role.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { DEPENDENCY_ADMIN_ROLES } from "../../domain/dependency.access";
import { validateFindDependency } from "../../domain/dependency.validators";
import { DEPENDENCY_ERROR_MESSAGES } from "../../utils/dependency-error-messages";
import {
	DEPENDENCY_INTENTS,
	type DependencyActionData,
	INTENT_FIELD,
} from "../../utils/parse-dependency-form-data";
import type { Route } from "./+types/index";

/**
 * Acciones de fila del listado: desactivar y restaurar. Se invocan con
 * useFetcher, así que no navegan: al terminar solo revalidan el loader.
 *
 * No hay acción de borrado. Una dependencia con personal no se puede borrar sin
 * dejar cuentas huérfanas —la FK es ON DELETE RESTRICT— y desactivarla es la vía
 * prevista: deja de admitir personal y conserva su historial.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<DependencyActionData> => {
	// 🔒 El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta.
	await requireRole(request, context, DEPENDENCY_ADMIN_ROLES);

	const formData = await request.formData();
	const intent = formData.get(INTENT_FIELD);

	const input = parseInput(
		() =>
			validateFindDependency({ documentId: formData.get("documentId") })
				.documentId,
	);
	if (!input.success) return localizeError(input, DEPENDENCY_ERROR_MESSAGES);

	const documentId = input.data;

	switch (intent) {
		case DEPENDENCY_INTENTS.archive: {
			const result = await context.dependencyService.archive(documentId);
			if (!result.success) {
				return localizeError(result, DEPENDENCY_ERROR_MESSAGES);
			}

			return ok(null, { message: "Dependencia desactivada" });
		}
		case DEPENDENCY_INTENTS.unarchive: {
			const result = await context.dependencyService.unarchive(documentId);
			if (!result.success) {
				return localizeError(result, DEPENDENCY_ERROR_MESSAGES);
			}

			return ok(null, { message: "Dependencia restaurada" });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
