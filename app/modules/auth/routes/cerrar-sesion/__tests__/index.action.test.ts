import { describe, expect, test } from "vitest";
import { serializeAuthCookies } from "@/core/cookies.server";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const requestWithRefresh = async (refreshToken: string | null) => {
	const headers: Record<string, string> = {};
	if (refreshToken !== null) {
		const cookies = await serializeAuthCookies({
			accessToken: "at",
			refreshToken,
		});
		headers.Cookie = cookies.map((c) => c.split(";")[0]).join("; ");
	}
	return new Request("https://app.example.com/cerrar-sesion", {
		method: "POST",
		headers,
	});
};

const createHarness = (options: { logoutFails?: boolean } = {}) => {
	const calls = { logout: [] as string[] };

	const context = {
		authService: {
			logout: async (token: string) => {
				calls.logout.push(token);
				if (options.logoutFails) {
					return {
						success: false as const,
						error: { code: "UNEXPECTED_ERROR", message: "db caída" },
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

describe("cerrar-sesion action", () => {
	test("revokes the session and clears both cookies", async () => {
		const { context, calls } = createHarness();

		const response = await run(await requestWithRefresh("rt"), context);

		expect(calls.logout).toEqual(["rt"]);
		const cookies = response.headers.getSetCookie();
		expect(cookies).toHaveLength(2);
		for (const cookie of cookies) expect(cookie).toContain("Max-Age=0");
	});

	// Se DEVUELVE (no se lanza) una Response completa para que el navegador
	// aplique los Set-Cookie antes de seguir el redirect. Un throw perdería las
	// cabeceras y el usuario se quedaría con las cookies puestas.
	test("returns a 303 redirect instead of throwing it", async () => {
		const { context } = createHarness();

		const response = await run(await requestWithRefresh("rt"), context);

		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/iniciar-sesion");
	});

	// Sin cookie de refresh no hay nada que revocar en el servidor, pero salir
	// sigue significando limpiar y redirigir.
	test("still clears and redirects when there is no refresh cookie", async () => {
		const { context, calls } = createHarness();

		const response = await run(await requestWithRefresh(null), context);

		expect(calls.logout).toEqual([]);
		expect(response.status).toBe(303);
		expect(response.headers.getSetCookie()).toHaveLength(2);
	});

	// El resultado del servicio NO cambia el desenlace: si el borrado falló, ya
	// quedó registrado. Dejar a alguien en una pantalla de error tras pedir salir
	// sería peor que una sesión huérfana que caducará sola.
	test("logs the user out even if the server-side revocation failed", async () => {
		const { context } = createHarness({ logoutFails: true });

		const response = await run(await requestWithRefresh("rt"), context);

		expect(response.status).toBe(303);
		expect(response.headers.getSetCookie()).toHaveLength(2);
	});
});
