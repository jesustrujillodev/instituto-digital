import { themePreviewCookie } from "@/core/cookies.server";
import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { exportThemeCss } from "../../domain/theme.mapper";
import { THEME_BUILDER_ERROR_MESSAGES } from "../../utils/theme-error-messages";
import type { Route } from "./+types/index";

/**
 * Estado del builder: la biblioteca y el tema abierto.
 *
 * El tema abierto viaja en la URL (`?tema=<documentId>`) y no en estado local:
 * así la pantalla es enlazable, sobrevive a un refresh y el botón "atrás" hace
 * lo esperado. Mismo criterio que los filtros del monitor de sesiones.
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Solo SUPERADMIN — un rol insuficiente produce un 403 real (no un redirect),
	// que pinta dashboard.boundary.tsx conservando el shell.
	await requireRole(request, context, ["SUPERADMIN"]);

	const listed = await context.themeService.listThemes();
	if (!listed.success) {
		throw toRouteError(listed.error, THEME_BUILDER_ERROR_MESSAGES);
	}

	const themes = listed.data;
	const requested = new URL(request.url).searchParams.get("tema");

	// Sin tema pedido se abre el activo, y si no hay ninguno activo, el primero
	// de la biblioteca (que siempre es un preset). Con la biblioteca vacía —seed
	// sin correr— no hay nada que abrir y la vista lo dice en vez de fallar.
	const selected =
		themes.find((theme) => theme.documentId === requested) ??
		themes.find((theme) => theme.isActive) ??
		themes[0];

	if (!selected) {
		return ok({
			themes,
			theme: null,
			exportedCss: "",
			previewDocumentId: null,
		});
	}

	const detail = await context.themeService.getTheme({
		documentId: selected.documentId,
	});
	if (!detail.success) {
		throw toRouteError(detail.error, THEME_BUILDER_ERROR_MESSAGES);
	}

	const previewDocumentId = await themePreviewCookie.parse(
		request.headers.get("Cookie"),
	);

	return ok({
		themes,
		theme: detail.data,
		// El CSS exportable se compone en el servidor porque ya está el tema
		// cargado; el botón de copiar no tiene que reimplementar el serializador.
		exportedCss: exportThemeCss(detail.data.draftTokens),
		previewDocumentId:
			typeof previewDocumentId === "string" ? previewDocumentId : null,
	});
};
