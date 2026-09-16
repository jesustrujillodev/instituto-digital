import { requireScope } from "@/shared/auth/require-scope.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { USER_MANAGER_ROLES } from "../../../domain/user.access.rules";
import { validateCreateUser } from "../../../domain/user.validators";
import {
	parseUserFormData,
	type UserActionData,
} from "../../../utils/parse-user-form-data";
import { USER_ERROR_MESSAGES } from "../../../utils/user-error-messages";
import type { Route } from "./+types/index";

export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<UserActionData> => {
	const { auth } = await requireScope(request, context, USER_MANAGER_ROLES);

	// El archivo se separa antes de validar: valibot recibe solo campos de texto,
	// y la foto sigue su propio camino.
	const { fields, photo } = parseUserFormData(await request.formData());

	const input = parseInput(() => validateCreateUser(fields));
	if (!input.success) return localizeError(input, USER_ERROR_MESSAGES);

	const created = await context.userService.create(input.data, auth);
	if (!created.success) return localizeError(created, USER_ERROR_MESSAGES);

	if (photo) {
		const photoResult = await context.userService.updatePhoto(
			created.data.documentId,
			photo,
			auth,
		);

		// Best-effort deliberado: la cuenta ya existe y es utilizable. Devolver un
		// fallo aquí dejaría al admin repitiendo el alta con un email que ya está
		// registrado. El servicio ya registró la causa real en el log.
		if (!photoResult.success) {
			return ok(null, {
				message:
					"Usuario creado, pero no se pudo guardar la foto. Puedes intentarlo desde la edición.",
			});
		}
	}

	return ok(null, { message: "Usuario creado" });
};
