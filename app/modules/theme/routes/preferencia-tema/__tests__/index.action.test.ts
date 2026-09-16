import { describe, expect, test } from "vitest";
import { themeModeCookie } from "@/core/cookies.server";
import type { AppResponse } from "@/shared/response/response.types";
import type { ThemeMode } from "../../../domain/theme.types";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const requestWithMode = (mode: string) => {
	const body = new FormData();
	body.set("mode", mode);
	return new Request("https://app.example.com/preferencia-tema", {
		method: "POST",
		body,
	});
};

const createHarness = (
	options: { userId?: number | null; saveFails?: boolean } = {},
) => {
	const calls = {
		setMode: [] as Array<{ userId: number | null; mode: ThemeMode }>,
	};

	const context = {
		authPayload: options.userId != null ? { userId: options.userId } : null,
		themeService: {
			setMode: async (input: { userId: number | null; mode: ThemeMode }) => {
				calls.setMode.push(input);
				if (options.saveFails) {
					return {
						success: false as const,
						error: {
							code: "THEME_PREFERENCE_NOT_SAVED",
							message: "Theme preference could not be persisted to the account",
						},
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: null,
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: ActionArgs["context"]) =>
	action({ request, context } as ActionArgs);

const themeCookie = (response: Response) =>
	response.headers.getSetCookie().find((c) => c.startsWith("__theme_mode="));

/**
 * `createCookie` serializa el valor como JSON en base64, así que el Set-Cookie
 * NO contiene el modo en claro. Se comprueba parseándolo con la misma cookie
 * —round-trip real— en vez de buscar una subcadena que nunca estará ahí.
 */
const themeCookieValue = async (response: Response) => {
	const header = themeCookie(response)?.split(";")[0];
	return header ? await themeModeCookie.parse(header) : null;
};

describe("preferencia-tema action", () => {
	test("emits the cookie and persists the preference for a signed-in user", async () => {
		const { context, calls } = createHarness({ userId: 7 });

		const response = await run(requestWithMode("dark"), context);

		expect(calls.setMode).toEqual([{ userId: 7, mode: "dark" }]);
		expect(await themeCookieValue(response)).toBe("dark");
	});

	// El toggle también se ofrece en la landing y en el login: sin sesión la
	// cookie ES toda la persistencia, y eso no es un error.
	test("works for an anonymous visitor, with a null userId", async () => {
		const { context, calls } = createHarness({ userId: null });

		const response = await run(requestWithMode("light"), context);

		expect(calls.setMode).toEqual([{ userId: null, mode: "light" }]);
		expect(await themeCookieValue(response)).toBe("light");
	});

	// La cookie no está firmada, así que se lee tal cual en la siguiente
	// petición: un modo inventado tiene que morir en la frontera, no acabar ahí.
	test("rejects an unknown mode without calling the service or setting a cookie", async () => {
		const { context, calls } = createHarness({ userId: 7 });

		const response = await run(requestWithMode("neon"), context);
		const body = (await response.json()) as AppResponse<null>;

		expect(response.status).toBe(400);
		expect(body.success).toBe(false);
		if (!body.success) expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(calls.setMode).toEqual([]);
		expect(themeCookie(response)).toBeUndefined();
	});

	// Fallo DEGRADADO: la cuenta no se pudo actualizar, pero el usuario pidió un
	// tema y en este navegador lo va a tener. La cookie sale igual.
	test("still emits the cookie when persisting to the account failed", async () => {
		const { context } = createHarness({ userId: 7, saveFails: true });

		const response = await run(requestWithMode("dark"), context);
		const body = (await response.json()) as AppResponse<null>;

		expect(await themeCookieValue(response)).toBe("dark");
		expect(body.success).toBe(false);
		if (!body.success) {
			expect(body.error.code).toBe("THEME_PREFERENCE_NOT_SAVED");
			// La copia que llega al cliente es la del diccionario del módulo, no el
			// mensaje técnico del dominio.
			expect(body.error.message).toContain("este navegador");
		}
	});

	test("the cookie outlives the session and stays server-only", async () => {
		const { context } = createHarness({ userId: 7 });

		const cookie = themeCookie(await run(requestWithMode("dark"), context));

		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain("Path=/");
		expect(Number(cookie?.match(/Max-Age=(\d+)/)?.[1])).toBeGreaterThan(
			60 * 60 * 24 * 300,
		);
	});
});
