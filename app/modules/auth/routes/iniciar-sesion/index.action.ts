import { redirect } from "react-router";
import { serializeAuthCookies } from "@/core/cookies.server";
import { validateLogin } from "@/modules/auth/domain/auth.validators";
import { AUTH_ERROR_MESSAGES } from "@/modules/auth/utils/auth-error-messages";
import { safeReturnTo } from "@/shared/auth/return-to";
import { getClientIp } from "@/shared/http/client-ip";
import { parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import type { AppResponse } from "@/shared/response/response.types";
import type { Route } from "./+types/index";

/**
 * El éxito no devuelve envelope: es un redirect con las cookies de sesión, y la
 * pantalla de login deja de existir. Solo el fallo tiene forma de respuesta.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<AppResponse<never>> => {
	const formData = Object.fromEntries(await request.formData());

	const input = parseInput(() => validateLogin(formData));
	if (!input.success) return localizeError(input, AUTH_ERROR_MESSAGES);

	const result = await context.authService.login(input.data, {
		userAgent: request.headers.get("User-Agent") ?? undefined,
		// Validada (formato IPv4/IPv6) y solo informativa — ver shared/http/client-ip
		ipAddress: getClientIp(request),
	});

	if (!result.success) return localizeError(result, AUTH_ERROR_MESSAGES);

	const cookies = await serializeAuthCookies(result.data);

	// Del formData crudo: `loginRule` es un `v.object` no-strict, así que un
	// campo extra pasa la validación pero no llega a `input.data`.
	throw redirect(safeReturnTo(formData.redirectTo, "/dashboard"), {
		headers: cookies.map((c) => ["Set-Cookie", c] as [string, string]),
	});
};
