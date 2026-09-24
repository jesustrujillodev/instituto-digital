import { requireAuth } from "@/shared/auth/require-auth.server";
import { toRouteError } from "@/shared/http/route-error";
import { ok } from "@/shared/response/response.helpers";
import { CERTIFICATE_ERROR_MESSAGES } from "../../utils/certificate-error-messages";
import type { Route } from "./+types/index";

/**
 * GET /dashboard/mis-certificados — los certificados vigentes de quien está en
 * sesión. El servicio filtra por su `userId`; ningún parámetro lo cambia.
 *
 * Basta con la sesión, sin `requireParticipant`: un externo sin dependencia no
 * cursa por el catálogo, pero sí recibe certificado y el correo lo trae aquí.
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireAuth(request, context);

	const result = await context.certificateService.listMine(auth);
	if (!result.success) {
		throw toRouteError(result.error, CERTIFICATE_ERROR_MESSAGES);
	}

	return ok({ certificates: result.data });
};
