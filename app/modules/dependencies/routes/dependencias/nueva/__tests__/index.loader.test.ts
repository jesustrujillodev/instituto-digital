import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const REQUEST = new Request(
	"https://app.example.com/dashboard/dependencias/nueva",
);

const contextOf = (role: Role | null) =>
	({
		authPayload:
			role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@instituto.gob.mx",
						role,
						dependencyId: null,
						iat: 1_800_000_000,
					},
	}) as unknown as LoaderArgs["context"];

const run = (context: LoaderArgs["context"]) =>
	loader({ request: REQUEST, context } as LoaderArgs);

describe("nueva dependencia loader", () => {
	// Estar bajo /dashboard solo garantiza sesión, no el rol: cada ruta impone su
	// propio guard.
	test("solo pasa el superadministrador", async () => {
		const result = await run(contextOf("SUPERADMIN"));

		expect(result.success).toBe(true);
		expect(result.success && result.data.auth.role).toBe("SUPERADMIN");
	});

	test("cualquier otro rol recibe 403", async () => {
		for (const role of [
			"USER",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			const thrown = await run(contextOf(role)).catch((e) => e);

			expect(thrown.init.status).toBe(403);
			expect(thrown.data.requiredRoles).toEqual(["SUPERADMIN"]);
		}
	});

	test("sin sesión redirige a login", async () => {
		const thrown = await run(contextOf(null)).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});
});
