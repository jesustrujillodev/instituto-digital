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
import { themeModeCookie, themePreviewCookie } from "@/core/cookies.server";
import { ThemePreviewBar } from "@/modules/theme/components/theme-preview-bar";
import { DEFAULT_THEME_TOKENS } from "@/modules/theme/domain/theme.config";
import {
	themeCss,
	themeFingerprint,
} from "@/modules/theme/domain/theme.mapper";
import { themeHtmlClass } from "@/modules/theme/domain/theme.rules";
import type { ResolvedTheme } from "@/modules/theme/domain/theme.types";
import { useLastKnownTheme } from "@/modules/theme/hooks/use-last-known-theme";
import {
	lastKnownThemeScript,
	THEME_STYLE_ID,
} from "@/modules/theme/utils/last-known-theme";
import { RouteErrorView } from "@/shared/components/errors/route-error-view";
import { configureContainer } from "@/shared/di/container.server";
import { isTrustedOrigin, isWriteMethod } from "@/shared/http/origin";
import { hasRole, type Role } from "@/shared/rules/atoms.rules";
import { containerContext } from "./shared/di/container.types";
import type { ApiContext } from "./shared/types";

export const links: Route.LinksFunction = () => [
	{ rel: "icon", type: "image/png", href: "/assets/favicon.png" },
];

/**
 * Quién puede previsualizar un tema sin publicar. Es una función de plataforma,
 * no de contenido: la ejerce quien administra la apariencia del instituto.
 */
const THEME_PREVIEW_ROLES: readonly Role[] = ["SUPERADMIN"];

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

		// 5. Append new cookies if tokens were silently refreshed
		// (shouldRedirectToLogin solo puede activarse ANTES de next() — el refresh
		// ocurre íntegro en configureContainer; no hay caso post-next que cubrir)
		if (apiContext.newCookies) {
			for (const cookie of apiContext.newCookies) {
				response.headers.append("Set-Cookie", cookie);
			}
		}

		return response;
	},
];

/**
 * Resuelve el tema para TODA la aplicación — dashboard, login y landing.
 *
 * Corre en cada petición, así que está escrito para no costar nada: el servicio
 * solo baja a la base cuando hay sesión y la cookie no trae preferencia.
 *
 * OJO al ponerle un CDN delante: esta respuesta VARÍA por cookie. Sin
 * `Vary: Cookie` una caché compartida serviría el tema de un usuario a otro.
 */
export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const cookieHeader = request.headers.get("Cookie");

	const [cookieMode, previewDocumentId] = await Promise.all([
		themeModeCookie.parse(cookieHeader),
		themePreviewCookie.parse(cookieHeader),
	]);

	const result = await context.themeService.resolve({
		cookieMode,
		userId: context.authPayload?.userId ?? null,
		previewDocumentId,
		// 🔒 El gate del preview es el ROL verificado en servidor, nunca la cookie:
		// esa la fabrica cualquiera. Sin un rol de plataforma, `previewDocumentId`
		// se ignora.
		canPreview:
			context.authPayload !== null &&
			hasRole(context.authPayload.role, THEME_PREVIEW_ROLES),
	});

	// Un fallo aquí no puede tumbar la página: el tema no es una decisión de
	// seguridad. Se sirve el tema base marcado como `fallback`, y el navegador
	// pinta encima el último tema activo que conoció.
	return {
		theme: result.success ? result.data : fallbackTheme(),
	};
};

/**
 * Tema base en modo system, marcado como `fallback`. Lo usan el loader cuando el
 * servicio falla y `Layout` cuando el loader ni siquiera corrió. Sale de la MISMA
 * constante — no hay un segundo juego de valores.
 */
const fallbackTheme = (): ResolvedTheme => ({
	mode: "system",
	css: themeCss(DEFAULT_THEME_TOKENS, "system"),
	preview: null,
	origin: "fallback",
	fingerprint: themeFingerprint(DEFAULT_THEME_TOKENS),
});

export function Layout({ children }: { children: React.ReactNode }) {
	// `Layout` también envuelve al ErrorBoundary, y ahí el loader puede no haber
	// llegado a correr: por eso se lee con `useRouteLoaderData` (que devuelve
	// undefined sin romper) y no con `useLoaderData`.
	const data = useRouteLoaderData<typeof loader>("root");
	const theme: ResolvedTheme = data?.theme ?? fallbackTheme();

	useLastKnownTheme(theme);

	return (
		<html lang="es" className={themeHtmlClass(theme.mode)}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				{/*
				 * Los tokens del tema, antes de <Links />: la hoja de Tailwind los
				 * consume, y así una utilidad puede pisarlos si alguna vez hace falta.
				 *
				 * El contenido lo genera `themeCss`, que expande los tokens y filtra
				 * nombres y valores contra una allowlist. Los tokens vienen de una
				 * columna `Json` de la base de datos: un valor con `</style>` cerraría
				 * la etiqueta y convertiría el tema en un vector de XSS.
				 */}
				<style
					id={THEME_STYLE_ID}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: CSS generado y saneado en serializeThemeCss
					dangerouslySetInnerHTML={{ __html: theme.css }}
				/>
				{/*
				 * Solo cuando el servidor NO sabe cuál es el tema activo (base caída y
				 * sin snapshot): pinta el último que guardó este navegador antes del
				 * primer pintado. En operación normal no se emite ningún script.
				 */}
				{theme.origin === "fallback" && (
					<script
						// biome-ignore lint/security/noDangerouslySetInnerHtml: script estático; solo interpola constantes y el modo validado, con JSON.stringify
						dangerouslySetInnerHTML={{
							__html: lastKnownThemeScript(theme.mode),
						}}
					/>
				)}
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
	return (
		<>
			<Outlet />
			{/* Va aquí y no en el layout del dashboard porque "probar en toda la app"
			    es literal: el preview también cubre la landing y el login, y la salida
			    tiene que estar donde el preview esté. Se pinta sola solo cuando el
			    loader raíz dice que hay uno activo. */}
			<ThemePreviewBar />
		</>
	);
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
