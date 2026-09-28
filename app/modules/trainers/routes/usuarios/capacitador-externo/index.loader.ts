import { requireRole } from "@/shared/auth/require-role.server";
import { ok } from "@/shared/response/response.helpers";
import { TRAINER_ADMIN_ROLES } from "../../../domain/trainer.access";
import type { Route } from "./+types/index";

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	// 🔒 Registrar externos no se recorta por dependencia: un externo no
	// pertenece a ninguna, así que aquí el guard es solo el rol.
	const auth = await requireRole(request, context, TRAINER_ADMIN_ROLES);

	return ok({ auth });
};
