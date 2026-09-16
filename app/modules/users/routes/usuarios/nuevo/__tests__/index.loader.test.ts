import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const REQUEST = new Request("https://app.example.com/usuarios/nuevo");

const contextOf = (role: Role | null) =>
	({
		authPayload:
			role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@empresa.com",
						role,
						dependencyId: null,
						iat: 1_800_000_000,
					},
		// El alta con alcance global ofrece el catálogo de ACTIVAS: una dependencia
		// desactivada no admite personal nuevo, así que no se ofrece como destino.
		dependencyService: {
			listActive: async () => ({
				success: true as const,
				data: [],
				timestamp: new Date().toISOString(),
			}),
		},
	}) as unknown as LoaderArgs["context"];

const run = (context: LoaderArgs["context"]) =>
	loader({ request: REQUEST, context } as LoaderArgs);

describe("usuarios/nuevo loader", () => {
	// Sin servicio de por medio, pero con el MISMO envelope: la pantalla lee la
	// misma forma venga de donde venga el dato.
	test("devuelve la identidad dentro del envelope estándar", async () => {
		const result = await run(contextOf("ADMIN"));

		expect(result.success).toBe(true);
		expect(result.data.auth.role).toBe("ADMIN");
		expect(result.timestamp).toEqual(expect.any(String));
	});

	// Cada ruta impone su propio guard: estar bajo /dashboard solo garantiza
	// sesión, no el rol necesario para administrar cuentas.
	test("corta con 403 para un rol insuficiente", async () => {
		const thrown = await run(contextOf("USER")).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		// El titular y el auxiliar SÍ dan de alta: el alcance recorta a quién, no si
		// pueden. Quien no entra es el participante.
		expect(thrown.data.requiredRoles).toEqual([
			"ADMIN",
			"SUPERADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		]);
	});

	test("redirige a login a quien no tiene sesión", async () => {
		const thrown = await run(contextOf(null)).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});
});
