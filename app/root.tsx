import {
	Links,
	Meta,
	Outlet,
	redirect,
	Scripts,
	ScrollRestoration,
	useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import "@/shared/rules/messages.rules";
import { appendRefreshedCookies, themeModeCookie } from "@/core/cookies.server";
import { themeHtmlClass } from "@/modules/theme/domain/theme.rules";
import type { ThemeMode } from "@/modules/theme/domain/theme.types";
import { RouteErrorView } from "@/shared/components/errors/route-error-view";
import { configureContainer } from "@/shared/di/container.server";
import { isTrustedOrigin, isWriteMethod } from "@/shared/http/origin";
import { containerContext } from "./shared/di/container.types";
import type { ApiContext } from "./shared/types";

export const links: Route.LinksFunction = () => [
	{ rel: "icon", type: "image/png", href: "/assets/favicon.png" },
];

export const middleware: Route.MiddlewareFunction[] = [
	async ({ context, request }, next) => {
		// 0. CSRF defensa en profundidad: mutaciones con Origin ajeno → 403
		//    (complementa SameSite=Lax; ver docs/auth/00-sistema-autenticacion.md §8)
		if (isWriteMethod(request.method) && !isTrustedOrigin(request)) {
			throw new Response("Forbidden: untrusted origin", { status: 403 });
		}

		const apiContext: ApiContext = {};

		// 1. Build the per-request container (also runs silent token-refresh logic)
		const awilixContainer = await configureContainer(request, apiContext);
		const cradle = awilixContainer.cradle;

		// 2. Make all services available via React Router context
		Object.assign(context, cradle);
		context.set(containerContext, cradle);

		// 3. If refresh failed before the handler → redirect immediately
		if (apiContext.shouldRedirectToLogin) {
			throw redirect("/iniciar-sesion", {
				headers: apiContext.newCookies
					? apiContext.newCookies.map(
							(c) => ["Set-Cookie", c] as [string, string],
						)
					: [],
			});
		}

		// 4. Run the actual loader / action
		const response = await next();

		// 5. Append new cookies if tokens were silently refreshed — unless the
		// handler (login/logout) already decided the auth cookies itself.
		// (shouldRedirectToLogin solo puede activarse ANTES de next() — el refresh
		// ocurre íntegro en configureContainer; no hay caso post-next que cubrir)
		if (apiContext.newCookies) {
			appendRefreshedCookies(response.headers, apiContext.newCookies);
		}

		return response;
	},
];

const DEFAULT_THEME_MODE: ThemeMode = "system";

/**
 * Resuelve el modo claro/oscuro para TODA la aplicación — dashboard, login y
 * landing.
 *
 * Corre en cada petición, así que está escrito para no costar nada: el servicio
 * solo baja a la base cuando hay sesión y la cookie no trae preferencia.
 *
 * OJO al ponerle un CDN delante: esta respuesta VARÍA por cookie. Sin
 * `Vary: Cookie` una caché compartida serviría el modo de un usuario a otro.
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const result = await context.themeService.resolveMode({
		cookieMode: await themeModeCookie.parse(request.headers.get("Cookie")),
		userId: context.authPayload?.userId ?? null,
	});

	// Un fallo aquí no puede tumbar la página: el modo no es una decisión de
	// seguridad.
	return {
		themeMode: result.success ? result.data : DEFAULT_THEME_MODE,
	};
};

export function Layout({ children }: { children: React.ReactNode }) {
	// `Layout` también envuelve al ErrorBoundary, y ahí el loader puede no haber
	// llegado a correr: por eso se lee con `useRouteLoaderData` (que devuelve
	// undefined sin romper) y no con `useLoaderData`.
	const data = useRouteLoaderData<typeof loader>("root");

	return (
		<html
			lang="es"
			className={themeHtmlClass(data?.themeMode ?? DEFAULT_THEME_MODE)}
		>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

// Boundary global: cubre 404 y cualquier error fuera del dashboard. Los errores
// DENTRO de /dashboard/* los captura antes dashboard.boundary.tsx, que los pinta
// conservando el shell.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	return (
		<main className="container mx-auto p-4 pt-16">
			<RouteErrorView error={error} homeTo="/" />
		</main>
	);
}
