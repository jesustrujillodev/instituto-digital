import { redirect } from "react-router";
import { parseTokenCookies } from "@/core/cookies.server";
import type { Route } from "./+types/index";

// If the user already has a valid access token, skip the login page
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const cookieHeader = request.headers.get("Cookie");
	const { accessToken } = await parseTokenCookies(cookieHeader);

	if (accessToken) {
		const payload = await context.authService.verifyAccessToken(accessToken);
		if (payload) throw redirect("/");
	}

	return null;
};
