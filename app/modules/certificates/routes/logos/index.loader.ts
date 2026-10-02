import { requireRole } from "@/shared/auth/require-role.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { CERTIFICATE_ERROR_MESSAGES } from "../../utils/certificate-error-messages";
import type { Route } from "./+types/index";

/** GET /dashboard/logos-institucionales — los logos de los certificados (SUPERADMIN). */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireRole(request, context, ["SUPERADMIN"]);

	const result = await context.certificateLogoService.list(auth);
	if (!result.success) {
		throw toRouteError(result.error, CERTIFICATE_ERROR_MESSAGES);
	}
	return ok({ logos: result.data });
};
