import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { GROUP_LIST_DEFAULTS } from "../../../domain/group.config";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const requestOf = (query = "") =>
	new Request(`https://app.example.com/dashboard/grupos${query}`);

const createHarness = (
	options: {
		role?: Role | null;
		dependencyId?: number | null;
		listFails?: string;
	} = {},
) => {
	const calls = { filters: [] as unknown[], scopes: [] as unknown[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "titular@instituto.gob.mx",
						role: options.role ?? "DEPENDENCY_HEAD",
						dependencyId:
							options.dependencyId === undefined ? 3 : options.dependencyId,
						isTrainer: false,
						iat: 1_800_000_000,
					},
		groupService: {
			list: async (filters: unknown, scope: unknown) => {
				calls.filters.push(filters);
				calls.scopes.push(scope);
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

describe("grupos loader — guard y alcance", () => {
	test("redirige a login a quien no tiene sesión", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});

	test("un participante recibe 403 sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.filters).toEqual([]);
	});

	test("el alcance del titular llega al servicio", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(), context);

		expect(calls.scopes).toEqual([{ kind: "dependency", dependencyId: 3 }]);
	});

	// El superadministrador consulta los grupos de todas las dependencias y no
	// administra ninguno: la matriz de §3 no le da esa columna.
	test("el superadministrador entra en modo consulta", async () => {
		const { context } = createHarness({
			role: "SUPERADMIN",
			dependencyId: null,
		});

		const result = await run(requestOf(), context);

		expect(result.success && result.data.canManage).toBe(false);
	});

	test("un titular sí administra", async () => {
		const { context } = createHarness();

		const result = await run(requestOf(), context);

		expect(result.success && result.data.canManage).toBe(true);
	});

	// Un titular cuya fila quedara sin dependencia tiene que traducirse a "no ve
	// nada", jamás a un `where` vacío.
	test("un titular sin dependencia no alcanza ni administra nada", async () => {
		const { context, calls } = createHarness({ dependencyId: null });

		const result = await run(requestOf(), context);

		expect(calls.scopes).toEqual([{ kind: "none" }]);
		expect(result.success && result.data.canManage).toBe(false);
	});
});

describe("grupos loader — filtros", () => {
	test("aplica los defaults del módulo cuando la URL no trae nada", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(), context);

		expect(calls.filters[0]).toMatchObject({
			page: GROUP_LIST_DEFAULTS.page,
			pageSize: GROUP_LIST_DEFAULTS.pageSize,
		});
	});

	test("lee los filtros del query string", async () => {
		const { context, calls } = createHarness();

		await run(
			requestOf("?page=2&search=mandos&status=archived&sortBy=createdAt"),
			context,
		);

		expect(calls.filters[0]).toMatchObject({
			page: 2,
			search: "mandos",
			status: "archived",
			sortBy: "createdAt",
		});
	});

	test("un sortBy fuera de la allowlist corta", async () => {
		const { context } = createHarness();

		await expect(
			run(requestOf("?sortBy=dependencyId"), context),
		).rejects.toThrow();
	});
});

describe("grupos loader — fallos del servicio", () => {
	test("corta con el status del código", async () => {
		const { context } = createHarness({ listFails: "GROUP_NOT_FOUND" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
	});

	test("un fallo desconocido corta con 500 sin exponer su mensaje", async () => {
		const { context } = createHarness({ listFails: "UNEXPECTED_ERROR" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toBe("técnico");
	});
});
