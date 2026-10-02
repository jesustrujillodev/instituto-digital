import { requireAuth } from "@/shared/auth/require-auth.server";
import { ok } from "@/shared/response/response.helpers";
import type { FullscreenLayoutData } from "../layout.types";
import type { Route } from "./+types/fullscreen.layout";

/**
 * Gate de autenticación de las pantallas completas, igual de estructural que el
 * del dashboard: lo que cuelga de este layout queda protegido por construcción.
 * No lee el estado de seguridad: el banner de lockdown es del shell, y estas
 * pantallas no lo tienen.
 */
export const loader = async ({
	request,
	context,
}: Route.LoaderArgs): Promise<FullscreenLayoutData> => {
	const auth = await requireAuth(request, context);

	return ok({
		user: {
			documentId: auth.documentId,
			email: auth.email,
			role: auth.role,
			isTrainer: auth.isTrainer,
			hasDependency: auth.dependencyId !== null,
		},
	});
};
