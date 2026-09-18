import { requireScope } from "@/shared/auth/require-scope.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { USER_MANAGER_ROLES } from "../../../domain/user.access.rules";
import {
	validateAdminResetPassword,
	validateChangeDependency,
	validateFindUser,
	validateUpdateUser,
} from "../../../domain/user.validators";
import {
	parseUserFormData,
	USER_INTENTS,
	type UserActionData,
} from "../../../utils/parse-user-form-data";
import { USER_ERROR_MESSAGES } from "../../../utils/user-error-messages";
import type { Route } from "./+types/index";

/**
 * Tres operaciones en un mismo action —actualizar el perfil, restablecer la
 * contraseña y trasladar de dependencia— separadas por el `intent` del envío, no
 * por el conjunto de campos recibidos: el diálogo de contraseña se abre también
 * desde el listado y no debe poder disparar un guardado de perfil, ni al revés.
 */
export const action = async ({
	request,
	context,
	params,
}: Route.ActionArgs): Promise<UserActionData> => {
	const { auth } = await requireScope(request, context, USER_MANAGER_ROLES);

	const { fields, photo, intent } = parseUserFormData(await request.formData());

	if (intent === USER_INTENTS.resetPassword) {
		const input = parseInput(() => ({
			documentId: validateFindUser({ documentId: params.documentId })
				.documentId,
			...validateAdminResetPassword(fields),
		}));
		if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

		const result = await context.userService.resetPassword(
			input.data.documentId,
			input.data.newPassword,
			auth,
		);
		if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

		// La propia cuenta no se desconecta: revocar aquí echaría al admin de la
		// sesión desde la que acaba de hacer el cambio.
		if (result.data.id === auth.userId) {
			return ok(null, { message: "Contraseña restablecida" });
		}

		// Un reseteo suele responder a una cuenta olvidada o comprometida: las
		// sesiones abiertas con la contraseña anterior no deben sobrevivirle.
		// Best-effort, como la foto: la contraseña ya cambió y deshacerlo sería peor.
		const revoked = await context.sessionMonitorService.revokeAllForUser(
			result.data.id,
		);

		return ok(null, {
			message: revoked.success
				? "Contraseña restablecida. Se cerraron sus sesiones abiertas."
				: "Contraseña restablecida, pero no se pudieron cerrar sus sesiones abiertas.",
		});
	}

	if (intent === USER_INTENTS.changeDependency) {
		const input = parseInput(() => ({
			documentId: validateFindUser({ documentId: params.documentId })
				.documentId,
			...validateChangeDependency(fields),
		}));
		if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

		const result = await context.userService.changeDependency(
			input.data.documentId,
			input.data.dependency,
			auth,
		);
		if (!result.success) return localizeError(result, USER_ERROR_MESSAGES);

		return ok(null, { message: "Dependencia actualizada" });
	}

	const input = parseInput(() => ({
		documentId: validateFindUser({ documentId: params.documentId }).documentId,
		dto: validateUpdateUser(fields),
	}));
	if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

	const { documentId, dto } = input.data;

	const updated = await context.userService.update(documentId, dto, auth);
	if (!updated.success) return localizeError(updated, USER_ERROR_MESSAGES);

	if (photo) {
		const photoResult = await context.userService.updatePhoto(
			documentId,
			photo,
			auth,
		);

		// Best-effort, igual que al crear: los datos del perfil ya se guardaron y
		// obligar a repetirlos por una foto sería peor. El servicio ya registró la
		// causa real en el log.
		if (!photoResult.success) {
			return ok(null, {
				message: "Cambios guardados, pero no se pudo actualizar la foto.",
			});
		}
	}

	return ok(null, { message: "Cambios guardados" });
};
