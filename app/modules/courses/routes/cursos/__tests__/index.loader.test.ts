import { describe, expect, test } from "vitest";
import { loader } from "../index.loader";
import { type ActorOptions, authPayloadOf, failReply } from "./route-harness";

type LoaderArgs = Parameters<typeof loader>[0];

const createHarness = (options: ActorOptions & { listFails?: string } = {}) => {
	const calls = {
		filters: [] as unknown[],
		scopes: [] as unknown[],
		catalogRequests: 0,
	};

	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			list: async (filters: unknown, scope: unknown) => {
				calls.filters.push(filters);
				calls.scopes.push(scope);
				if (options.listFails) return failReply(options.listFails);
				return {
					success: true as const,
					data: [],
					pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
					timestamp: new Date().toISOString(),
				};
			},
		},
		dependencyService: {
			listCatalog: async () => {
				calls.catalogRequests += 1;
				return {
					success: true as const,
					data: [{ id: 3, documentId: "dep-1", name: "Obras Públicas" }],
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (query: string, context: LoaderArgs["context"]) =>
	loader({
		request: new Request(`https://app.example.com/dashboard/cursos${query}`),
		context,
	} as LoaderArgs);

describe("cursos loader — guard", () => {
	test("un participante sin perfil recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run("", context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.scopes).toEqual([]);
	});

	// §4: el externo solo imparte. No tiene dependencia, así que no alcanza nada.
	test("un capacitador externo recibe 403", async () => {
		const { context } = createHarness({
			role: "USER",
			isTrainer: true,
			dependencyId: null,
		});

		const thrown = await run("", context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
	});

	test("un capacitador interno entra con alcance de autor", async () => {
		const { context, calls } = createHarness({ role: "USER", isTrainer: true });

		await run("", context);

		expect(calls.scopes).toEqual([
			{ kind: "creator", dependencyId: 3, userId: 7 },
		]);
	});
});

describe("cursos loader — filtros", () => {
	// El filtro por dependencia se suma al alcance, pero fuera del alcance global
	// ni siquiera se lee: no hay nada que ampliar.
	test("un titular no puede pedir otra dependencia por la URL", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			"?dependency=22222222-2222-4222-8222-222222222222",
			context,
		);

		expect(calls.filters[0]).toMatchObject({ dependency: undefined });
		expect(calls.catalogRequests).toBe(0);
		expect(result.data.canFilterByDependency).toBe(false);
	});

	test("el superadministrador filtra por dependencia y recibe el catálogo", async () => {
		const { context, calls } = createHarness({
			role: "SUPERADMIN",
			dependencyId: null,
		});

		const result = await run(
			"?dependency=22222222-2222-4222-8222-222222222222&status=PUBLISHED",
			context,
		);

		expect(calls.filters[0]).toMatchObject({
			dependency: "22222222-2222-4222-8222-222222222222",
			status: "PUBLISHED",
		});
		expect(result.data.dependencies).toEqual([
			{ documentId: "dep-1", name: "Obras Públicas" },
		]);
	});

	test("un fallo del servicio corta con un error de ruta", async () => {
		const { context } = createHarness({ listFails: "UNEXPECTED_ERROR" });

		const thrown = await run("", context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
	});
});
