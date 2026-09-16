import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { TRAINER_LIST_DEFAULTS } from "../../../domain/trainer.config";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const requestOf = (query = "") =>
	new Request(`https://app.example.com/dashboard/capacitadores${query}`);

const okList = () => ({
	success: true as const,
	data: [],
	pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
	timestamp: new Date().toISOString(),
});

const createHarness = (
	options: {
		role?: Role | null;
		isTrainer?: boolean;
		listFails?: string;
		candidatesFail?: boolean;
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
						email: "ana@instituto.gob.mx",
						role: options.role ?? "DEPENDENCY_HEAD",
						dependencyId: 3,
						isTrainer: options.isTrainer ?? false,
						iat: 1_800_000_000,
					},
		trainerService: {
			list: async (filters: unknown) => {
				calls.filters.push(filters);
				if (options.listFails) {
					return {
						success: false as const,
						error: { code: options.listFails, message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return okList();
			},
		},
		userService: {
			list: async (_filters: unknown, scope: unknown) => {
				calls.scopes.push(scope);
				if (options.candidatesFail) {
					return {
						success: false as const,
						error: { code: "UNEXPECTED_ERROR", message: "técnico" },
						timestamp: new Date().toISOString(),
					};
				}
				return okList();
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: LoaderArgs["context"]) =>
	loader({ request, context } as LoaderArgs);

describe("capacitadores loader — guard", () => {
	test("redirige a login a quien no tiene sesión", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});

	// Es el único guard del sistema que no depende solo del rol: §3 del alcance
	// deja consultar el catálogo a cualquier capacitador.
	test("un participante CON perfil entra al catálogo", async () => {
		const { context, calls } = createHarness({
			role: "USER",
			isTrainer: true,
		});

		const result = await run(requestOf(), context);

		expect(result.success).toBe(true);
		expect(calls.filters).toHaveLength(1);
	});

	test("un participante sin perfil recibe 403 con requiredRoles", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(thrown.data.requiredRoles).toContain("DEPENDENCY_HEAD");
		expect(calls.filters).toEqual([]);
	});

	test("los roles de gestión entran sin perfil", async () => {
		for (const role of [
			"SUPERADMIN",
			"ADMIN",
			"DEPENDENCY_HEAD",
			"DEPENDENCY_DEPUTY",
		] as const) {
			const { context } = createHarness({ role });

			await expect(run(requestOf(), context)).resolves.toBeDefined();
		}
	});
});

describe("capacitadores loader — permisos de escritura", () => {
	// Ver el catálogo y modificarlo son dos permisos distintos; la pantalla es la
	// misma y las acciones aparecen solo para quien administra.
	test("un capacitador sin rol de gestión lo ve en modo consulta", async () => {
		const { context, calls } = createHarness({
			role: "USER",
			isTrainer: true,
		});

		const result = await run(requestOf(), context);

		expect(result.success && result.data.canManage).toBe(false);
		// Sin nada que activar, no se pide la lista de candidatos.
		expect(calls.scopes).toEqual([]);
		expect(result.success && result.data.candidates).toEqual([]);
	});

	test("un titular recibe candidatos acotados a SU alcance", async () => {
		const { context, calls } = createHarness({ role: "DEPENDENCY_HEAD" });

		const result = await run(requestOf(), context);

		expect(result.success && result.data.canManage).toBe(true);
		expect(calls.scopes).toEqual([{ kind: "dependency", dependencyId: 3 }]);
	});
});

describe("capacitadores loader — filtros", () => {
	test("aplica los defaults del módulo cuando la URL no trae nada", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(), context);

		expect(calls.filters[0]).toMatchObject({
			page: TRAINER_LIST_DEFAULTS.page,
			pageSize: TRAINER_LIST_DEFAULTS.pageSize,
		});
	});

	test("lee todos los filtros del query string", async () => {
		const { context, calls } = createHarness();

		await run(
			requestOf(
				"?page=2&pageSize=25&search=ana&type=EXTERNAL&specialty=transparencia&status=archived&sortBy=specialty&sortDir=desc",
			),
			context,
		);

		expect(calls.filters[0]).toEqual({
			page: 2,
			pageSize: 25,
			search: "ana",
			type: "EXTERNAL",
			specialty: "transparencia",
			status: "archived",
			sortBy: "specialty",
			sortDir: "desc",
		});
	});

	// La allowlist manda aunque el valor venga de la URL: acabaría en un orderBy.
	test("un sortBy fuera de la allowlist corta", async () => {
		const { context } = createHarness();

		await expect(run(requestOf("?sortBy=password"), context)).rejects.toThrow();
	});

	test("devuelve el estado de vista normalizado", async () => {
		const { context } = createHarness();

		const result = await run(requestOf(), context);

		expect(result.success && result.data.filters).toEqual({
			search: "",
			type: "",
			specialty: "",
			status: "active",
			sortBy: "firstName",
			sortDir: "asc",
		});
	});
});

describe("capacitadores loader — fallos del servicio", () => {
	test("corta con el status del código", async () => {
		const { context } = createHarness({
			listFails: "TRAINER_PROFILE_NOT_FOUND",
		});

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
	});

	test("un fallo al cargar candidatos corta sin exponer su mensaje", async () => {
		const { context } = createHarness({ candidatesFail: true });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toBe("técnico");
	});
});
