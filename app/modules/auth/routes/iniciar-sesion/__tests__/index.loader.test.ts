import { describe, expect, test } from "vitest";
import type { VerifiedAccessTokenPayload } from "../../../domain/auth.types";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const PAYLOAD: VerifiedAccessTokenPayload = {
	sub: "11111111-1111-4111-8111-111111111111",
	userId: 7,
	email: "ana@empresa.com",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const loginRequest = (search = "") =>
	new Request(`https://app.example.com/iniciar-sesion${search}`);

const contextWith = (authPayload: VerifiedAccessTokenPayload | null) =>
	({ authPayload }) as unknown as LoaderArgs["context"];

const run = (request: Request, context: LoaderArgs["context"]) =>
	loader({ request, context } as LoaderArgs);

describe("iniciar-sesion loader", () => {
	// Quien ya tiene sesión no debería ver el formulario: entrar y volver a
	// autenticarse crearía una segunda sesión sin motivo.
	test("con sesión, redirige al dashboard", async () => {
		const thrown = await run(loginRequest(), contextWith(PAYLOAD)).catch(
			(e) => e,
		);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/dashboard");
	});

	// Sin payload cae todo lo que el middleware no aceptó: sin cookie, token
	// caducado sin refresh válido, firma manipulada o token revocado por epoch.
	test("sin sesión, pinta el formulario", async () => {
		expect(await run(loginRequest(), contextWith(null))).toMatchObject({
			success: true,
			data: { redirectTo: "" },
		});
	});

	// El escaneo del QR es el único destino que el login acepta conservar.
	test("con sesión y un redirectTo de asistencia, vuelve al escaneo", async () => {
		const thrown = await run(
			loginRequest(`?redirectTo=${encodeURIComponent(`/asistencia/${TOKEN}`)}`),
			contextWith(PAYLOAD),
		).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe(`/asistencia/${TOKEN}`);
	});

	test("con sesión y un redirectTo hostil, lo ignora", async () => {
		const thrown = await run(
			loginRequest("?redirectTo=https%3A%2F%2Fevil.com"),
			contextWith(PAYLOAD),
		).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe("/dashboard");
	});

	test("sin sesión, el redirectTo válido llega al formulario", async () => {
		const result = await run(
			loginRequest(`?redirectTo=${encodeURIComponent(`/asistencia/${TOKEN}`)}`),
			contextWith(null),
		);

		expect(result).toMatchObject({
			data: { redirectTo: `/asistencia/${TOKEN}` },
		});
	});

	test("sin sesión, un redirectTo hostil no llega al formulario", async () => {
		const result = await run(
			loginRequest("?redirectTo=%2F%2Fevil.com"),
			contextWith(null),
		);

		expect(result).toMatchObject({ data: { redirectTo: "" } });
	});
});
