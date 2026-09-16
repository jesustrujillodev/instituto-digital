import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok, parseInput } from "@/shared/response/response.helpers";
import { CLOUD_ERROR_CODES } from "../../domain/cloud.errors";
import { validateCloudList } from "../../domain/cloud.rules";
import { CLOUD_ERROR_MESSAGES } from "../../utils/cloud-error-messages";
import type { Route } from "./+types/index";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Solo ADMIN: un rol insuficiente produce un 403 real.
	await requireRole(request, context, ["ADMIN"]);

	const { searchParams } = new URL(request.url);

	// La carpeta la teclea cualquiera en la barra de direcciones: una ruta con
	// `..` sale como 400 con su copia, no como un ValiError sin capturar.
	const input = parseInput(() =>
		validateCloudList({
			path: searchParams.get("path") ?? "",
			cursor: searchParams.get("cursor") || undefined,
		}),
	);
	if (!input.success) throw toRouteError(input.error, CLOUD_ERROR_MESSAGES);

	const result = await context.cloudService.list(input.data);

	if (!result.success) {
		// La plantilla arranca sin storage: eso es un estado de la pantalla, no un
		// error de ruta.
		if (result.error.code === CLOUD_ERROR_CODES.NOT_CONFIGURED) {
			return ok({ configured: false as const, path: input.data.path });
		}
		throw toRouteError(result.error, CLOUD_ERROR_MESSAGES);
	}

	return ok({ configured: true as const, listing: result.data });
};
