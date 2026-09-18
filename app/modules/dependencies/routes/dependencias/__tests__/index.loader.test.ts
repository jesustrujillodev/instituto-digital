import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { DEPENDENCY_LIST_DEFAULTS } from "../../../domain/dependency.config";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const requestOf = (query = "") =>
	new Request(`https://app.example.com/dashboard/dependencias${query}`);

const createHarness = (
	options: { role?: Role | null; listFails?: string } = {},
) => {
	const calls = { filters: [] as unknown[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@instituto.gob.mx",
						role: options.role ?? "SUPERADMIN",
						dependencyId: null,
						iat: 1_800_000_000,
					},
		dependencyService: {
			list: async (filters: unknown) => {
				calls.filters.push(filters);
				if (options.listFails) {
					return {
						success: false as const,
						error: { code: options.listFails, message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: [],
					pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: LoaderArgs["context"]) =>
	loader({ request, context } as LoaderArgs);

describe("dependencias loader — guard", () => {
	// Criterio de aceptación 3 del PRD: aquí el recurso existe y la sesión es
	// válida; lo que falta es permiso. Un 403 lo dice y conserva la URL.
	test("un titular recibe 403 con requiredRoles, sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "DEPENDENCY_HEAD" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(thrown.data.requiredRoles).toEqual(["SUPERADMIN"]);
		expect(calls.filters).toEqual([]);
	});

	test("ningún rol salvo SUPERADMIN entra", async () => {
		for (const role of [
			"USER",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			const { context } = createHarness({ role });
			const thrown = await run(requestOf(), context).catch((e) => e);

			expect(thrown.init.status).toBe(403);
		}
	});

	test("redirige a login a quien no tiene sesión", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});

	test("el superadministrador pasa y consulta el servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(requestOf(), context);

		expect(result.success).toBe(true);
		expect(calls.filters).toHaveLength(1);
	});
});

describe("dependencias loader — filtros", () => {
	test("aplica los defaults del módulo cuando la URL no trae nada", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(), context);

		expect(calls.filters[0]).toMatchObject({
			page: DEPENDENCY_LIST_DEFAULTS.page,
			pageSize: DEPENDENCY_LIST_DEFAULTS.pageSize,
		});
	});

	// Los filtros viven en la URL: así la vista es enlazable, sobrevive a un
	// refresh y el botón "atrás" hace lo esperado.
	test("lee todos los filtros del query string", async () => {
		const { context, calls } = createHarness();

		await run(
			requestOf(
				"?page=3&pageSize=25&search=obras&status=archived&sortBy=createdAt&sortDir=desc",
			),
			context,
		);

		expect(calls.filters[0]).toEqual({
			page: 3,
			pageSize: 25,
			search: "obras",
			status: "archived",
			sortBy: "createdAt",
			sortDir: "desc",
		});
	});

	test("una paginación basura cae a los defaults", async () => {
		const { context, calls } = createHarness();

		await run(requestOf("?page=abc&pageSize=0"), context);

		expect(calls.filters[0]).toMatchObject({ page: 1, pageSize: 10 });
	});

	test("una búsqueda vacía no viaja como filtro", async () => {
		const { context, calls } = createHarness();

		await run(requestOf("?search="), context);

		expect(calls.filters[0]).toMatchObject({ search: undefined });
	});

	// La allowlist manda aunque el valor venga de la URL: acabaría en un orderBy.
	test("un sortBy fuera de la allowlist corta", async () => {
		const { context } = createHarness();

		await expect(run(requestOf("?sortBy=id"), context)).rejects.toThrow();
	});

	test("devuelve el estado de vista normalizado", async () => {
		const { context } = createHarness();

		const result = await run(requestOf(), context);

		expect(result.success && result.data.filters).toEqual({
			search: "",
			status: "active",
			sortBy: "name",
			sortDir: "asc",
		});
	});
});

describe("dependencias loader — fallos del servicio", () => {
	// Un loader que falla no tiene pantalla que mostrar: corta con el status del
	// código y deja el error al ErrorBoundary.
	test("corta con el status del código", async () => {
		const { context } = createHarness({ listFails: "DEPENDENCY_NOT_FOUND" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
		expect(thrown.data.message).toBe("La dependencia ya no existe.");
	});

	test("un fallo desconocido corta con 500 sin exponer su mensaje", async () => {
		const { context } = createHarness({ listFails: "UNEXPECTED_ERROR" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toBe("técnico");
	});
});
