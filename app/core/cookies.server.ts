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
// Preferencia de esquema de color. Es lo que permite al SERVIDOR emitir el tema
// correcto en el primer byte y por tanto lo que elimina el flash, sin el script
// bloqueante en <head> que usan las librerías de tema en cliente.
//
// HttpOnly como las de auth, y por una razón concreta: NADIE la lee desde el
// cliente. El modo llega a los componentes por el loader raíz (que es quien lo
// resolvió y quien emitió el CSS), así que abrirla a JavaScript no compraría
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

// ── Theme preview cookie ───────────────────────────────────────────────────────
// "Probar en toda la app": dice QUÉ tema previsualizar mientras se navega el
// dashboard con un borrador puesto.
//
// Mismo criterio que la de modo —HttpOnly y sin firmar— y por el mismo motivo:
// nadie la lee desde el cliente, el loader raíz es quien la interpreta y quien
// emite el CSS. La barra flotante que ofrece salir del preview se pinta con lo
// que ese loader devuelve, no leyendo la cookie.
//
// No lleva `secrets` porque NO autoriza nada: el loader solo la atiende si el rol
// verificado en servidor es ADMIN. Cualquiera puede fabricarla; a quien no sea
// admin no le sirve de nada.
//
// De sesión (sin `maxAge`): un preview es algo que se está probando ahora, no un
// estado que deba sobrevivir al cierre del navegador.
export const themePreviewCookie = createCookie("__theme_preview", {
	httpOnly: true,
	secure: isProduction,
	sameSite: "lax",
	path: "/",
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
