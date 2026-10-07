import { requireAuth } from "@/shared/auth/require-auth.server";
import { ok } from "@/shared/response/response.helpers";
import type { Route } from "./+types/index";
import { loadDashboard } from "./load-dashboard.server";

/** GET /dashboard — lo que le toca a quien entra, según lo que hace en la plataforma. */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = await requireAuth(request, context);

	return ok(await loadDashboard(auth, context));
};
