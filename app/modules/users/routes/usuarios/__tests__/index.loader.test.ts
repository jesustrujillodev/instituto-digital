import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { USER_LIST_DEFAULTS } from "../../../domain/user.config";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const requestOf = (query = "") =>
	new Request(`https://app.example.com/usuarios${query}`);

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
						email: "ana@empresa.com",
						role: options.role ?? "SUPERADMIN",
						dependencyId: null,
						iat: 1_800_000_000,
					},
		// Con alcance global el loader pide el catálogo para la columna y el filtro
		// de dependencia. Sin este doble, la pantalla no podría nombrarlas.
		dependencyService: {
			listCatalog: async () => ({
				success: true as const,
				data: [],
				timestamp: new Date().toISOString(),
			}),
		},
		userService: {
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

describe("usuarios loader — guard", () => {
	// Un rol insuficiente produce un 403 REAL, no un redirect: el recurso existe y
	// la sesión es válida, lo que falta es permiso. Y así se conserva la URL.
	test("corta con 403 para un rol insuficiente, sin llegar al servicio", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.filters).toEqual([]);
	});

	test("redirige a login a quien no tiene sesión", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});
});

describe("usuarios loader — filtros", () => {
	test("sin query string usa los defaults del módulo", async () => {
		const { context, calls } = createHarness();

		await run(requestOf(), context);

		expect(calls.filters[0]).toMatchObject({
			page: USER_LIST_DEFAULTS.page,
			pageSize: USER_LIST_DEFAULTS.pageSize,
		});
	});

	test("lee los filtros de la URL", async () => {
		const { context, calls } = createHarness();

		await run(
			requestOf(
				"?page=2&pageSize=25&search=ana&role=SUPERADMIN&status=archived&sortBy=email&sortDir=asc",
			),
			context,
		);

		expect(calls.filters[0]).toMatchObject({
			page: 2,
			pageSize: 25,
			search: "ana",
			role: "SUPERADMIN",
			status: "archived",
			sortBy: "email",
			sortDir: "asc",
		});
	});

	// El query string lo escribe cualquiera: basura, decimales y no positivos caen
	// al default en vez de llegar al skip/take del repositorio.
	test("descarta basura, decimales y números no positivos", async () => {
		const { context, calls } = createHarness();

		await run(requestOf("?page=abc&pageSize=0"), context);

		expect(calls.filters[0]).toMatchObject({
			page: USER_LIST_DEFAULTS.page,
			pageSize: USER_LIST_DEFAULTS.pageSize,
		});
	});

	// Una búsqueda vacía es ausencia de filtro, no un filtro por cadena vacía.
	test("un search vacío se trata como ausencia de filtro", async () => {
		const { context, calls } = createHarness();

		await run(requestOf("?search="), context);

		expect((calls.filters[0] as { search?: string }).search).toBeUndefined();
	});

	// La allowlist sigue mandando: una columna no declarada hace fallar la
	// validación en vez de colarse hasta el orderBy.
	test("una columna de orden fuera de la allowlist lanza", async () => {
		const { context } = createHarness();

		await expect(run(requestOf("?sortBy=password"), context)).rejects.toThrow();
	});
});

describe("usuarios loader — respuesta", () => {
	test("devuelve el envelope con su paginación y el estado de vista", async () => {
		const { context } = createHarness();

		const result = await run(requestOf(), context);

		expect(result.success).toBe(true);
		expect(result.pagination).toEqual({
			page: 1,
			pageSize: 10,
			total: 0,
			totalPages: 1,
		});
		expect(result.data.filters).toEqual({
			search: "",
			role: "",
			dependency: "",
			type: "",
			trainer: "",
			status: "active",
			sortBy: "createdAt",
			sortDir: "desc",
		});
	});

	test("incluye la identidad para que la pantalla no la vuelva a pedir", async () => {
		const { context } = createHarness();

		const result = await run(requestOf(), context);

		expect(result.data.auth.role).toBe("SUPERADMIN");
	});

	// Un loader que falla no tiene pantalla que mostrar: corta con el status del
	// código y deja el error al ErrorBoundary, sin filtrar el mensaje técnico.
	test("corta con el status del código cuando el servicio falla", async () => {
		const { context } = createHarness({ listFails: "USER_NOT_FOUND" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
		expect(thrown.data.code).toBe("USER_NOT_FOUND");
		expect(thrown.data.message).toBe("El usuario ya no existe.");
	});

	test("un fallo desconocido corta con 500 sin exponer su mensaje", async () => {
		const { context } = createHarness({ listFails: "UNEXPECTED_ERROR" });

		const thrown = await run(requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toBe("técnico");
	});
});
