import { describe, expect, test } from "vitest";
import {
	accessTokenCookie,
	clearAuthCookies,
	parseTokenCookies,
	refreshTokenCookie,
	serializeAuthCookies,
	themeModeCookie,
} from "../cookies.server";

/** Une varios Set-Cookie en la cabecera Cookie que mandaría el navegador. */
const asCookieHeader = (setCookies: string[]) =>
	setCookies.map((c) => c.split(";")[0]).join("; ");

describe("serializeAuthCookies", () => {
	test("emits both cookies when a refresh token is issued", async () => {
		const cookies = await serializeAuthCookies({
			accessToken: "at",
			refreshToken: "rt",
		});

		expect(cookies).toHaveLength(2);
		expect(cookies[0]).toContain("__access_token=");
		expect(cookies[1]).toContain("__refresh_token=");
	});

	// refreshToken null ⇒ hit de gracia del refresh: solo se reemite el access
	// token y la cookie de refresh del cliente se deja INTACTA. Reemitirla
	// sobrescribiría la buena con una que el servidor no puede reconstruir (en la
	// base solo hay hashes).
	test("emits ONLY the access cookie on a grace hit", async () => {
		const cookies = await serializeAuthCookies({
			accessToken: "at",
			refreshToken: null,
		});

		expect(cookies).toHaveLength(1);
		expect(cookies[0]).toContain("__access_token=");
	});
});

describe("parseTokenCookies", () => {
	// Round-trip completo: lo que se serializa es exactamente lo que se recupera,
	// firma de cookie incluida.
	test("recovers both tokens from the header it produced", async () => {
		const header = asCookieHeader(
			await serializeAuthCookies({ accessToken: "at", refreshToken: "rt" }),
		);

		const parsed = await parseTokenCookies(header);

		expect(parsed).toEqual({ accessToken: "at", refreshToken: "rt" });
	});

	test("returns null for each token when the header is empty or absent", async () => {
		expect(await parseTokenCookies(null)).toEqual({
			accessToken: null,
			refreshToken: null,
		});
		expect(await parseTokenCookies("")).toEqual({
			accessToken: null,
			refreshToken: null,
		});
	});

	test("returns null for the cookie that is missing", async () => {
		const header = asCookieHeader(
			await serializeAuthCookies({ accessToken: "at", refreshToken: null }),
		);

		const parsed = await parseTokenCookies(header);

		expect(parsed.accessToken).toBe("at");
		expect(parsed.refreshToken).toBeNull();
	});

	// Las cookies van firmadas con COOKIE_SECRET: un valor manipulado no se acepta
	// como bueno, se descarta.
	test("rejects a tampered cookie value", async () => {
		const parsed = await parseTokenCookies("__access_token=valor-inventado");

		expect(parsed.accessToken).toBeNull();
	});
});

describe("clearAuthCookies", () => {
	test("expires both cookies", async () => {
		const cookies = await clearAuthCookies();

		expect(cookies).toHaveLength(2);
		for (const cookie of cookies) {
			expect(cookie).toContain("Max-Age=0");
			expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
		}
	});

	// El navegador BORRA la cookie al ver Max-Age=0, así que en la práctica deja de
	// mandarla. Si aun así llegara el valor vaciado, sigue siendo falsy: el
	// `if (accessToken)` de configureContainer lo trata igual que a una ausencia y
	// nunca intenta verificar una cadena vacía como si fuera un token.
	test("the cleared value is falsy, so it is treated as no token", async () => {
		const parsed = await parseTokenCookies(
			asCookieHeader(await clearAuthCookies()),
		);

		expect(parsed.accessToken).toBeFalsy();
		expect(parsed.refreshToken).toBeFalsy();
	});
});

describe("cookie attributes", () => {
	// HttpOnly es lo que impide que un XSS lea el token desde JavaScript, y
	// SameSite=Lax la primera capa contra CSRF (la segunda es el chequeo de Origin).
	test("both cookies are HttpOnly, SameSite=Lax and scoped to the whole site", async () => {
		const cookies = await serializeAuthCookies({
			accessToken: "at",
			refreshToken: "rt",
		});

		for (const cookie of cookies) {
			expect(cookie).toContain("HttpOnly");
			expect(cookie).toContain("SameSite=Lax");
			expect(cookie).toContain("Path=/");
		}
	});

	// NODE_ENV=test ⇒ no se exige Secure, o la suite (y el desarrollo en http)
	// no podrían usarlas.
	test("Secure is off outside production", async () => {
		const [cookie] = await serializeAuthCookies({
			accessToken: "at",
			refreshToken: null,
		});

		expect(cookie).not.toContain("Secure");
	});

	test("the cookie names are the stable ones the container reads", () => {
		expect(accessTokenCookie.name).toBe("__access_token");
		expect(refreshTokenCookie.name).toBe("__refresh_token");
	});

	// El maxAge sale del MISMO env que firma el token: una cookie que sobreviviera
	// a su token dejaría al cliente creyendo que sigue autenticado.
	test("each cookie carries a positive Max-Age", async () => {
		const cookies = await serializeAuthCookies({
			accessToken: "at",
			refreshToken: "rt",
		});

		for (const cookie of cookies) {
			const maxAge = Number(cookie.match(/Max-Age=(\d+)/)?.[1]);
			expect(maxAge).toBeGreaterThan(0);
		}
	});
});

// La cookie de tema comparte los atributos de seguridad de las de auth pero NO
// va firmada: no es material secreto. Estos tests fijan esa diferencia para que
// nadie la "corrija" en ninguno de los dos sentidos.
describe("themeModeCookie", () => {
	test("is HttpOnly: nada del cliente la lee", async () => {
		// El modo llega a los componentes por el loader raíz, no leyendo la cookie
		// desde el navegador. Abrirla a JavaScript no compraría nada.
		expect(await themeModeCookie.serialize("dark")).toContain("HttpOnly");
	});

	test("round-trips the value it wrote", async () => {
		const serialized = await themeModeCookie.serialize("light");
		const header = serialized.split(";")[0];

		expect(await themeModeCookie.parse(header)).toBe("light");
	});

	// Sin `secrets`: el valor no va firmado. Si alguien añadiera la firma, las
	// cookies ya emitidas dejarían de parsear y todo el mundo volvería de golpe
	// al tema por defecto.
	test("is not signed, so an unsigned value still parses", async () => {
		const raw = `__theme_mode=${encodeURIComponent(btoa(JSON.stringify("dark")))}`;

		expect(await themeModeCookie.parse(raw)).toBe("dark");
	});

	// Un año: la preferencia de tema no caduca sola. Si heredara el Max-Age del
	// access token, el usuario volvería al tema por defecto cada cinco minutos.
	test("outlives the session by a wide margin", async () => {
		const serialized = await themeModeCookie.serialize("dark");
		const maxAge = Number(serialized.match(/Max-Age=(\d+)/)?.[1]);

		expect(maxAge).toBeGreaterThan(60 * 60 * 24 * 300);
	});

	test("is scoped to the whole site and SameSite=Lax", async () => {
		const serialized = await themeModeCookie.serialize("dark");

		expect(serialized).toContain("Path=/");
		expect(serialized).toContain("SameSite=Lax");
	});
});
