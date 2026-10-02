import { describe, expect, test } from "vitest";
import { loader } from "../fullscreen.layout.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const run = (authPayload: unknown) =>
	loader({
		request: new Request(
			"https://app.example.com/dashboard/capacitaciones/x/certificado/editor",
		),
		context: { authPayload } as unknown as LoaderArgs["context"],
		params: {},
	} as unknown as LoaderArgs);

describe("layout a pantalla completa", () => {
	test("con sesión expone la misma identidad que el dashboard", async () => {
		const result = await run({
			sub: "11111111-1111-4111-8111-111111111111",
			userId: 7,
			email: "ana@instituto.gob.mx",
			role: "DEPENDENCY_HEAD",
			dependencyId: 3,
			isTrainer: false,
			iat: 1_800_000_000,
		});

		expect(result).toMatchObject({
			success: true,
			data: {
				user: {
					documentId: "11111111-1111-4111-8111-111111111111",
					email: "ana@instituto.gob.mx",
					role: "DEPENDENCY_HEAD",
					isTrainer: false,
					hasDependency: true,
				},
			},
		});
	});

	test("sin sesión corta igual que el dashboard", async () => {
		const thrown = await run(null).catch((error) => error);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.status).toBe(302);
	});
});
