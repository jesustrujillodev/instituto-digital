import { describe, expect, test } from "vitest";
import { serializeAuthCookies } from "@/core/cookies.server";
import type { VerifiedAccessTokenPayload } from "../../../domain/auth.types";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const PAYLOAD: VerifiedAccessTokenPayload = {
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role: "USER",
	dependencyId: 3,
	iat: 1_800_000_000,
};

const requestWithCookies = async (accessToken: string | null) => {
	const headers: Record<string, string> = {};
	if (accessToken !== null) {
		const cookies = await serializeAuthCookies({
			accessToken,
			refreshToken: null,
		});
		headers.Cookie = cookies.map((c) => c.split(";")[0]).join("; ");
	}
	return new Request("https://app.example.com/iniciar-sesion", { headers });
};

const createHarness = (payload: VerifiedAccessTokenPayload | null) => {
	const calls = { verify: [] as string[] };

	const context = {
		authService: {
			verifyAccessToken: async (token: string) => {
				calls.verify.push(token);
				return payload;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: LoaderArgs["context"]) =>
	loader({ request, context } as LoaderArgs);

describe("iniciar-sesion loader", () => {
	// Quien ya tiene sesión no debería ver el formulario: entrar y volver a
	// autenticarse crearía una segunda sesión sin motivo.
	test("redirects away when the visitor already has a valid token", async () => {
		const { context } = createHarness(PAYLOAD);

		const thrown = await run(
			await requestWithCookies("token-valido"),
			context,
		).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/");
	});

	test("renders the form when there is no cookie at all", async () => {
		const { context, calls } = createHarness(PAYLOAD);

		expect(await run(await requestWithCookies(null), context)).toBeNull();
		expect(calls.verify).toEqual([]);
	});

	// Cookie presente pero token caducado o manipulado: el formulario se pinta,
	// que es justo lo que necesita quien viene a renovar su sesión.
	test("renders the form when the token does not verify", async () => {
		const { context } = createHarness(null);

		expect(
			await run(await requestWithCookies("token-caducado"), context),
		).toBeNull();
	});

	test("verifies the token that came in the cookie", async () => {
		const { context, calls } = createHarness(PAYLOAD);

		await run(await requestWithCookies("token-valido"), context).catch(
			() => {},
		);

		expect(calls.verify).toEqual(["token-valido"]);
	});
});
