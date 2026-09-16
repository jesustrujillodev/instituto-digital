import { themePreviewCookie } from "@/core/cookies.server";
import { requireRole } from "@/shared/auth/require-role.server";
import { HTTP_STATUS } from "@/shared/http/route-error";
import { fail, ok, parseInput } from "@/shared/response/response.helpers";
import {
	localizeError,
	resolveErrorCopy,
} from "@/shared/response/response.messages";
import type { FailResponse } from "@/shared/response/response.types";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import {
	validateCloneTheme,
	validateCreateTheme,
	validateImportThemeCss,
	validateRenameTheme,
	validateSaveDraft,
	validateThemeTarget,
} from "../../domain/theme.validators";
import { parseTokensField } from "../../utils/parse-theme-form-data";
import {
	INTENT_FIELD,
	THEME_INTENTS,
	TOKENS_FIELD,
} from "../../utils/theme-builder-form";
import { THEME_BUILDER_ERROR_MESSAGES } from "../../utils/theme-error-messages";
import type { Route } from "./+types/index";

/**
 * Mutaciones del builder.
 *
 * No hay escalera de `catch`: el servicio ya devuelve el envelope con un código
 * estable y `localizeError` le pone la copia. Lo único que sigue lanzando aquí
 * es la validación de frontera, y de eso se encarga `parseInput`.
 *
 * Devuelve siempre una `Response` construida a mano —y no el envelope suelto—
 * porque dos de las intenciones tienen que adjuntar un `Set-Cookie`, y un único
 * tipo de retorno evita que el consumidor distinga entre dos formas.
 */
export const action = async ({
	request,
	context,
}: Route.ActionArgs): Promise<Response> => {
	// 🔒 El guard se repite en el action: un loader protegido no protege las
	// mutaciones de su propia ruta.
	await requireRole(request, context, ["ADMIN"]);

	const formData = await request.formData();
	const intent = formData.get(INTENT_FIELD);
	const service = context.themeService;

	const json = (body: unknown, init?: ResponseInit) =>
		Response.json(body, init);

	/**
	 * Un fallo se responde con SU status, no con un 200.
	 *
	 * Aquí no es cosmético: el autoguardado del builder reintenta solo, y con un
	 * 200 en un error de validación no hay forma —ni en el cliente, ni en un log,
	 * ni en una prueba— de distinguir "guardado" de "rechazado". El status sale
	 * del mismo diccionario que la copia (THEME_BUILDER_ERROR_MESSAGES), así que
	 * el código de negocio sigue siendo la fuente de verdad.
	 */
	const failed = (response: FailResponse) => {
		const localized = localizeError(response, THEME_BUILDER_ERROR_MESSAGES);

		return json(localized, {
			status:
				resolveErrorCopy(localized.error, THEME_BUILDER_ERROR_MESSAGES)
					.status ??
				(localized.error.code === RESPONSE_ERROR_CODES.UNEXPECTED
					? HTTP_STATUS.INTERNAL_SERVER_ERROR
					: HTTP_STATUS.BAD_REQUEST),
		});
	};

	switch (intent) {
		case THEME_INTENTS.create: {
			const input = parseInput(() =>
				validateCreateTheme({
					name: formData.get("name"),
					fromDocumentId: formData.get("fromDocumentId") || undefined,
				}),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.createTheme(input.data);
			if (!result.success) {
				return failed(result);
			}

			// El único intent que devuelve dato: la pantalla abre el tema recién
			// creado y pide su nombre, y ese documentId no lo puede saber de otra
			// forma.
			return json(
				ok(
					{ createdDocumentId: result.data.documentId },
					{ message: `Tema "${result.data.name}" creado` },
				),
			);
		}

		case THEME_INTENTS.clone: {
			const input = parseInput(() =>
				validateCloneTheme({
					documentId: formData.get("documentId"),
					name: formData.get("name"),
				}),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.cloneTheme(input.data);
			if (!result.success) {
				return failed(result);
			}

			// Igual que `create`: la copia se abre sola, así que la pantalla
			// necesita saber cuál es.
			return json(
				ok(
					{ createdDocumentId: result.data.documentId },
					{ message: `Tema "${result.data.name}" duplicado` },
				),
			);
		}

		case THEME_INTENTS.rename: {
			const input = parseInput(() =>
				validateRenameTheme({
					documentId: formData.get("documentId"),
					name: formData.get("name"),
				}),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.renameTheme(input.data);
			if (!result.success) {
				return failed(result);
			}

			return json(ok(null, { message: "Nombre actualizado" }));
		}

		case THEME_INTENTS.saveDraft: {
			const input = parseInput(() =>
				validateSaveDraft({
					documentId: formData.get("documentId"),
					tokens: parseTokensField(formData.get(TOKENS_FIELD)),
				}),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.saveDraft(input.data);
			if (!result.success) {
				return failed(result);
			}

			return json(ok(null, { message: "Borrador guardado" }));
		}

		case THEME_INTENTS.importCss: {
			const input = parseInput(() =>
				validateImportThemeCss({
					documentId: formData.get("documentId"),
					css: formData.get("css"),
				}),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.importThemeCss(input.data);
			if (!result.success) {
				return failed(result);
			}

			return json(ok(null, { message: "Tema importado en el borrador" }));
		}

		case THEME_INTENTS.publish: {
			const input = parseInput(() =>
				validateThemeTarget({ documentId: formData.get("documentId") }),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.publishTheme(input.data);
			if (!result.success) {
				return failed(result);
			}

			return json(ok(null, { message: "Tema publicado" }));
		}

		case THEME_INTENTS.activate: {
			const input = parseInput(() =>
				validateThemeTarget({ documentId: formData.get("documentId") }),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.activateTheme(input.data);
			if (!result.success) {
				return failed(result);
			}

			// Activar y seguir en preview daría una pantalla que miente sobre lo que
			// ven los demás: se sale del preview en el mismo movimiento.
			return json(
				ok(null, { message: "Tema activado para toda la plataforma" }),
				{
					headers: { "Set-Cookie": await clearPreview() },
				},
			);
		}

		case THEME_INTENTS.discard: {
			const input = parseInput(() =>
				validateThemeTarget({ documentId: formData.get("documentId") }),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.discardDraft(input.data);
			if (!result.success) {
				return failed(result);
			}

			return json(ok(null, { message: "Se restauró la versión publicada" }));
		}

		case THEME_INTENTS.delete: {
			const input = parseInput(() =>
				validateThemeTarget({ documentId: formData.get("documentId") }),
			);
			if (!input.success) {
				return failed(input);
			}

			const result = await service.deleteTheme(input.data);
			if (!result.success) {
				return failed(result);
			}

			return json(ok(null, { message: "Tema eliminado" }), {
				headers: { "Set-Cookie": await clearPreview() },
			});
		}

		case THEME_INTENTS.startPreview: {
			const input = parseInput(() =>
				validateSaveDraft({
					documentId: formData.get("documentId"),
					tokens: parseTokensField(formData.get(TOKENS_FIELD)),
				}),
			);
			if (!input.success) {
				return failed(input);
			}

			// Se guarda ANTES de encender la cookie: el preview sirve el borrador
			// PERSISTIDO, así que sin este guardado se estaría probando lo anterior.
			const result = await service.saveDraft(input.data);
			if (!result.success) {
				return failed(result);
			}

			return json(
				ok(null, { message: "Probando el borrador en toda la aplicación" }),
				{
					headers: {
						"Set-Cookie": await themePreviewCookie.serialize(
							input.data.documentId,
						),
					},
				},
			);
		}

		case THEME_INTENTS.stopPreview:
			return json(ok(null, { message: "Preview desactivado" }), {
				headers: { "Set-Cookie": await clearPreview() },
			});

		default:
			return json(
				fail({
					code: RESPONSE_ERROR_CODES.VALIDATION,
					message: "Acción no reconocida.",
				}),
				{ status: 400 },
			);
	}
};

/** Cookie de preview vacía y caducada: el loader raíz vuelve al tema publicado. */
const clearPreview = () =>
	themePreviewCookie.serialize("", { maxAge: 0, expires: new Date(0) });
