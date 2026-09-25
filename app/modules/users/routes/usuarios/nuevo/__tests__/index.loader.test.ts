import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const REQUEST = new Request("https://app.example.com/usuarios/nuevo");

const DEPENDENCY = {
	documentId: "22222222-2222-4222-8222-222222222222",
	name: "Obras Públicas",
};

const contextOf = (role: Role | null, dependencyId: number | null = null) =>
	({
		authPayload:
			role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@empresa.com",
						role,
						dependencyId,
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
			findByInternalId: async () => ({
				success: true as const,
				data: DEPENDENCY,
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
		const result = await run(contextOf("SUPERADMIN"));

		expect(result.success).toBe(true);
		expect(result.data.auth.role).toBe("SUPERADMIN");
		expect(result.timestamp).toEqual(expect.any(String));
	});

	// La regla del formulario exige dependencia a todo interno: el campo fijo
	// del titular tiene que llegar con la suya, no vacío.
	test("el titular recibe su dependencia ya elegida", async () => {
		const result = await run(contextOf("DEPENDENCY_HEAD", 3));

		expect(result.data).toMatchObject({
			canChooseDependency: false,
			dependencies: [DEPENDENCY],
			defaultDependency: DEPENDENCY.documentId,
		});
	});

	// Cada ruta impone su propio guard: estar bajo /dashboard solo garantiza
	// sesión, no el rol necesario para administrar cuentas.
	test("corta con 403 para un rol insuficiente", async () => {
		const thrown = await run(contextOf("USER")).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		// El titular y el auxiliar SÍ dan de alta: el alcance recorta a quién, no si
		// pueden. Quien no entra es el participante.
		expect(thrown.data.requiredRoles).toEqual([
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
