import { requireScope } from "@/shared/auth/require-scope.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { USER_MANAGER_ROLES } from "../../domain/user.access.rules";
import { validateDeleteUser } from "../../domain/user.validators";
import {
	INTENT_FIELD,
	USER_INTENTS,
	type UserActionData,
} from "../../utils/parse-user-form-data";
import { USER_ERROR_MESSAGES } from "../../utils/user-error-messages";
import type { Route } from "./+types/index";

/**
 * Acciones de fila del listado: archivar, desarchivar y borrar de forma
 * permanente. Se invocan con useFetcher, así que no navegan: al terminar solo
 * revalidan el loader de esta ruta.
 *
 * No hay escalera de `catch`: el servicio ya devuelve el envelope con un código
 * estable, y `localizeError` le pone la copia de USER_ERROR_MESSAGES. Lo único
 * que sigue lanzando aquí es la validación de frontera.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<UserActionData> => {
	// 🔒 El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta. Se toma el `auth` completo y no solo el
	// alcance: archivar exige además comparar rangos, porque un auxiliar y su
	// titular comparten dependencia.
	const { auth } = await requireScope(request, context, USER_MANAGER_ROLES);

	const formData = await request.formData();
	const intent = formData.get(INTENT_FIELD);

	const input = parseInput(
		() =>
			validateDeleteUser({ documentId: formData.get("documentId") }).documentId,
	);
	if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

	const documentId = input.data;

	switch (intent) {
		case USER_INTENTS.archive: {
			const result = await context.userService.archive(documentId, auth);
			if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

			return ok(null, { message: "Usuario archivado" });
		}
		case USER_INTENTS.unarchive: {
			const result = await context.userService.unarchive(documentId, auth);
			if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

			return ok(null, { message: "Usuario restaurado" });
		}
		case USER_INTENTS.delete: {
			const result = await context.userService.delete(documentId, auth);
			if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

			return ok(null, { message: "Usuario eliminado permanentemente" });
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
