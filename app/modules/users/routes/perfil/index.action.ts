import { requireAuth } from "@/shared/auth/require-auth.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateChangeOwnDependency,
	validateChangePassword,
} from "../../domain/user.validators";
import {
	parseUserFormData,
	USER_INTENTS,
	type UserActionData,
} from "../../utils/parse-user-form-data";
import { USER_ERROR_MESSAGES } from "../../utils/user-error-messages";
import type { Route } from "./+types/index";

/**
 * Las dos operaciones que alguien puede hacer sobre su propia cuenta, separadas
 * por intención.
 *
 * Ninguna recibe a quién aplicar: el sujeto es siempre quien envía, tomado del
 * token. Aceptarlo del formulario convertiría esta pantalla —que no tiene guard
 * de rol— en una vía para tocar cuentas ajenas.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<UserActionData> => {
	const auth = await requireAuth(request, context);

	const { fields, intent } = parseUserFormData(await request.formData());

	switch (intent) {
		case USER_INTENTS.changePassword: {
			const input = parseInput(() => validateChangePassword(fields));
			if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

			const result = await context.userService.changeOwnPassword(
				input.data,
				auth,
			);
			if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

			return ok(null, { message: "Contraseña actualizada" });
		}
		case USER_INTENTS.changeDependency: {
			const input = parseInput(() => validateChangeOwnDependency(fields));
			if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

			const result = await context.userService.changeDependency(
				auth.documentId,
				input.data.dependency,
				auth,
			);
			if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

			// El alcance nuevo viaja en el token, así que la sesión se cierra para que
			// la siguiente petición lo lleve ya actualizado.
			return ok(null, {
				message:
					"Dependencia actualizada. Vuelve a iniciar sesión para que tu nuevo alcance tenga efecto.",
			});
		}
		default:
			return fail({
				code: RESPONSE_ERROR_CODES.VALIDATION,
				message: "Acción no reconocida.",
			});
	}
};
