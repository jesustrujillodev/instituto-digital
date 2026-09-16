import { themeModeCookie } from "@/core/cookies.server";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { localizeError } from "@/shared/response/response.messages";
import { validateSetThemeMode } from "../../domain/theme.validators";
import { THEME_ERROR_MESSAGES } from "../../utils/theme-error-messages";
import type { Route } from "./+types/index.action";

/**
 * Cambia la preferencia de esquema de color.
 *
 * Vive en la zona PÚBLICA a propósito: el toggle también se ofrece en la landing
 * y en el login, así que colgar esta ruta del layout del dashboard obligaría a
 * tener sesión para poder cambiar de tema.
 *
 * Dos efectos, con distinto alcance:
 *   1. La cookie — siempre. Es la que hace que el servidor pueda pintar el tema
 *      correcto en el primer byte de la siguiente petición.
 *   2. La columna de la cuenta — solo con sesión. Es la que hace que la
 *      preferencia siga al usuario a otro dispositivo.
 *
 * Si (2) falla, (1) ya se emitió: la respuesta lo dice con esa copia y la
 * pantalla no se rompe. La defensa CSRF la impone ya el middleware de root.tsx.
 *
 * Devuelve siempre una `Response` construida a mano —y no el envelope suelto que
 * usan los actions de formulario— porque hay que adjuntar el `Set-Cookie` en
 * TODAS las ramas que llegan a emitirlo. Un único tipo de retorno, además, evita
 * que el consumidor tenga que distinguir entre las dos formas.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<Response> => {
	const formData = await request.formData();

	const input = parseInput(() =>
		validateSetThemeMode({ mode: formData.get("mode") }),
	);
	// Modo inventado: sin cookie. Persistir un valor que la allowlist rechaza lo
	// dejaría fallando en silencio en cada petición posterior.
	if (!input.success) {
		return Response.json(localizeError(input, THEME_ERROR_MESSAGES), {
			status: 400,
		});
	}

	const { mode } = input.data;

	const result = await context.themeService.setMode({
		userId: context.authPayload?.userId ?? null,
		mode,
	});

	// La cookie se emite pase lo que pase con la cuenta: el usuario pidió un tema
	// y en ESTE navegador lo va a tener.
	const headers = new Headers({
		"Set-Cookie": await themeModeCookie.serialize(mode),
	});

	if (!result.success) {
		return Response.json(localizeError(result, THEME_ERROR_MESSAGES), {
			headers,
		});
	}

	return Response.json(ok(null), { headers });
};
