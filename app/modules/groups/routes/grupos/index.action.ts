import { requireScope } from "@/shared/auth/require-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { GROUP_ACCESS_ROLES } from "../../domain/group.access";
import { validateFindGroup } from "../../domain/group.validators";
import { GROUP_ERROR_MESSAGES } from "../../utils/group-error-messages";
import {
	GROUP_INTENTS,
	type GroupActionData,
	INTENT_FIELD,
} from "../../utils/parse-group-form-data";
import type { Route } from "./+types/index";

/**
 * Acciones de fila: archivar y restaurar. Se invocan con useFetcher, así que no
 * navegan: al terminar solo revalidan el loader.
 *
 * No hay borrado. Archivar libera el nombre dentro de la dependencia y conserva
 * a los miembros, que es lo que se espera de una lista que ya se usó.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<GroupActionData> => {
	// 🔒 El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta. Que el alcance permita escribir lo decide el
	// servicio.
	const { auth } = await requireScope(request, context, GROUP_ACCESS_ROLES);

	const formData = await request.formData();
	const intent = formData.get(INTENT_FIELD);

	const input = parseInput(
		() =>
			validateFindGroup({ documentId: formData.get("documentId") }).documentId,
	);
	if (!input.success) return localizeError(input, GROUP_ERROR_MESSAGES);

	const documentId = input.data;

	switch (intent) {
		case GROUP_INTENTS.archive: {
			const result = await context.groupService.archive(documentId, auth);
			if (!result.success) return localizeError(result, GROUP_ERROR_MESSAGES);

			return ok(null, { message: "Grupo archivado" });
		}
		case GROUP_INTENTS.unarchive: {
			const result = await context.groupService.unarchive(documentId, auth);
			if (!result.success) return localizeError(result, GROUP_ERROR_MESSAGES);

			return ok(null, { message: "Grupo restaurado" });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
