import { describe, expect, test } from "vitest";
import type { VerifiedAccessTokenPayload } from "../../../domain/auth.types";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const REQUEST = new Request("https://app.example.com/cerrar-sesiones", {
	method: "POST",
});

const PAYLOAD: VerifiedAccessTokenPayload = {
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const createHarness = (
	authPayload: VerifiedAccessTokenPayload | null = PAYLOAD,
) => {
	const calls = { logoutAll: [] as number[] };

	const context = {
		authPayload,
		authService: {
			logoutAll: async (userId: number) => {
				calls.logoutAll.push(userId);
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

const run = (context: ActionArgs["context"]) =>
	action({ request: REQUEST, context } as ActionArgs);

describe("cerrar-sesiones action", () => {
	// Revoca la familia COMPLETA del usuario autenticado: es el botón de "me han
	// robado el portátil", así que el id sale de la sesión, nunca del formulario.
	test("revokes every session of the authenticated user", async () => {
		const { context, calls } = createHarness();

		await run(context);

		expect(calls.logoutAll).toEqual([7]);
	});

	test("clears both cookies and redirects with a 303", async () => {
		const { context } = createHarness();

		const response = await run(context);

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/iniciar-sesion");
		const cookies = response.headers.getSetCookie();
		expect(cookies).toHaveLength(2);
		for (const cookie of cookies) expect(cookie).toContain("Max-Age=0");
	});

	// Exige sesión: sin ella no hay usuario cuyas sesiones revocar, y el guard
	// redirige a login en vez de dejar pasar la mutación.
	test("requires a session — an anonymous request is redirected to login", async () => {
		const { context, calls } = createHarness(null);

		const thrown = await run(context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
		expect(calls.logoutAll).toEqual([]);
	});
});
