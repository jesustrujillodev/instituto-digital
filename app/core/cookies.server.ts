import { createCookie } from "react-router";
import { env } from "./env.server";

const isProduction = env.NODE_ENV === "production";

// ── Access token cookie ────────────────────────────────────────────────────────
// Short-lived JWT. maxAge derives from the SAME env constant the TokenService
// uses to sign — single source of truth (docs/auth/00-sistema-autenticacion.md §4).
export const accessTokenCookie = createCookie("__access_token", {
	httpOnly: true,
	secure: isProduction,
	sameSite: "lax",
	path: "/",
	maxAge: env.AUTH_ACCESS_TOKEN_TTL_S,
	secrets: [env.COOKIE_SECRET],
});

// ── Refresh token cookie ───────────────────────────────────────────────────────
// Long-lived opaque token. Stores NO data — the session lives in the database
// (and only as a hash; the raw token exists solely in this cookie).
export const refreshTokenCookie = createCookie("__refresh_token", {
	httpOnly: true,
	secure: isProduction,
	sameSite: "lax",
	path: "/",
	maxAge: env.AUTH_REFRESH_TOKEN_TTL_S,
	secrets: [env.COOKIE_SECRET],
});

// ── Theme mode cookie ──────────────────────────────────────────────────────────
// Preferencia de esquema de color. Es lo que permite al SERVIDOR poner la clase
// correcta en <html> desde el primer byte y por tanto lo que elimina el flash,
// sin el script bloqueante en <head> que usan las librerías de tema en cliente.
//
// HttpOnly como las de auth, y por una razón concreta: NADIE la lee desde el
// cliente. El modo llega a los componentes por el loader raíz (que es quien lo
// resolvió y quien puso la clase de <html>), así que abrirla a JavaScript no compraría
// nada. Un `useThemeMode` que la leyera del navegador además desincronizaría el
// marcado del servidor con el de la hidratación.
//
// Sin `secrets` a diferencia de las de auth: no es material secreto ni una
// credencial. Su peor abuso es que alguien fuerce su propio esquema de color, y
// el valor se valida contra la allowlist al leerlo (resolveThemeMode).
export const themeModeCookie = createCookie("__theme_mode", {
	httpOnly: true,
	secure: isProduction,
	sameSite: "lax",
	path: "/",
	maxAge: 60 * 60 * 24 * 365, // un año: la preferencia no caduca sola
});

// ── Helpers ────────────────────────────────────────────────────────────────────

export const parseTokenCookies = async (cookieHeader: string | null) => {
	const [accessToken, refreshToken] = await Promise.all([
		accessTokenCookie.parse(cookieHeader),
		refreshTokenCookie.parse(cookieHeader),
	]);
	return {
		accessToken: accessToken as string | null,
		refreshToken: refreshToken as string | null,
	};
};

// refreshToken null ⇒ hit de gracia del refresh: solo se reemite el access
// token y la cookie de refresh del cliente se deja intacta.
export const serializeAuthCookies = async (tokens: {
	accessToken: string;
	refreshToken: string | null;
}): Promise<string[]> => {
	const cookies = [accessTokenCookie.serialize(tokens.accessToken)];
	if (tokens.refreshToken !== null) {
		cookies.push(refreshTokenCookie.serialize(tokens.refreshToken));
	}
	return Promise.all(cookies);
};

export const clearAuthCookies = async (): Promise<string[]> => {
	return Promise.all([
		accessTokenCookie.serialize("", { maxAge: 0, expires: new Date(0) }),
		refreshTokenCookie.serialize("", { maxAge: 0, expires: new Date(0) }),
	]);
};

const AUTH_COOKIE_PREFIXES = [
	`${accessTokenCookie.name}=`,
	`${refreshTokenCookie.name}=`,
];

/**
 * Anexa a la respuesta las cookies del refresco silencioso, salvo que el handler
 * ya haya fijado las de auth.
 *
 * El navegador aplica el ÚLTIMO Set-Cookie de cada nombre: si el refresco se
 * anexara detrás del logout, resucitaría la sesión que el logout acaba de borrar
 * (y detrás de un login, pisaría la sesión nueva con la vieja). Quien decide la
 * sesión en la respuesta es el handler.
 */
export const appendRefreshedCookies = (
	headers: Headers,
	refreshedCookies: string[],
): void => {
	const handlerSetsAuthCookies = headers
		.getSetCookie()
		.some((cookie) =>
			AUTH_COOKIE_PREFIXES.some((prefix) => cookie.startsWith(prefix)),
		);
	if (handlerSetsAuthCookies) return;

	for (const cookie of refreshedCookies) {
		headers.append("Set-Cookie", cookie);
	}
};
