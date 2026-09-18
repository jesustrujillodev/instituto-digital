import { requireAuth } from "@/shared/auth/require-auth.server";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import { validateChangePassword } from "../../domain/user.validators";
import {
	parseUserFormData,
	USER_INTENTS,
	type UserActionData,
} from "../../utils/parse-user-form-data";
import { USER_ERROR_MESSAGES } from "../../utils/user-error-messages";
import type { Route } from "./+types/index";

/**
 * Lo único que alguien hace sobre su propia cuenta: cambiar su contraseña.
 *
 * No recibe a quién aplicar: el sujeto es siempre quien envía, tomado del token.
 * Aceptarlo del formulario convertiría esta pantalla —que no tiene guard de
 * rol— en una vía para tocar cuentas ajenas. La adscripción no se cambia aquí:
 * la decide quien administra, desde la edición del usuario.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<UserActionData> => {
	const auth = await requireAuth(request, context);

	const { fields, intent } = parseUserFormData(await request.formData());

	if (intent !== USER_INTENTS.changePassword) {
		return fail({
			code: RESPONSE_ERROR_CODES.VALIDATION,
			message: "Acción no reconocida.",
		});
	}

	const input = parseInput(() => validateChangePassword(fields));
	if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

	const result = await context.userService.changeOwnPassword(input.data, auth);
	if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

	return ok(null, { message: "Contraseña actualizada" });
};
