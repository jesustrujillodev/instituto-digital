import { describe, expect, test } from "vitest";
import { serializeAuthCookies } from "@/core/cookies.server";
import type { Role } from "@/shared/rules/atoms.rules";
import { SESSION_LIST_DEFAULTS } from "../../../domain/auth.config";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const requestOf = async (query = "", refreshToken: string | null = null) => {
	const headers: Record<string, string> = {};
	if (refreshToken !== null) {
		const cookies = await serializeAuthCookies({
			accessToken: "at",
			refreshToken,
		});
		headers.Cookie = cookies.map((c) => c.split(";")[0]).join("; ");
	}
	return new Request(`https://app.example.com/sesiones${query}`, { headers });
};

const createHarness = (
	options: {
		role?: Role | null;
		listFails?: boolean;
		stateFails?: boolean;
	} = {},
) => {
	const calls = { filters: [] as unknown[], refreshToken: [] as unknown[] };

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "ana@empresa.com",
						role: options.role ?? "SUPERADMIN",
						iat: 1_800_000_000,
					},
		authConfig: { accessTokenTtlS: 300, securityStateCacheTtlS: 5 },
		sessionMonitorService: {
			list: async (filters: unknown, refreshToken: unknown) => {
				calls.filters.push(filters);
				calls.refreshToken.push(refreshToken);
				if (options.listFails) {
					return {
						success: false as const,
						error: { code: "SESSION_NOT_FOUND", message: "técnico" },
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
		securityStateService: {
			getState: async () => {
				if (options.stateFails) {
					return {
						success: false as const,
						error: { code: "UNEXPECTED_ERROR", message: "db caída" },
						timestamp: new Date().toISOString(),
					};
				}
				return {
					success: true as const,
					data: { lockdownAt: null, lockdownScope: null },
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (request: Request, context: LoaderArgs["context"]) =>
	loader({ request, context } as LoaderArgs);

describe("sesiones loader — guard", () => {
	// El panel opera sobre sesiones de TERCEROS: sin el guard, cualquier usuario
	// autenticado podría listar y revocar las de los demás.
	test("cuts with a 403 for a non-admin", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(await requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls.filters).toEqual([]);
	});

	test("redirects an anonymous visitor to login", async () => {
		const { context } = createHarness({ role: null });

		const thrown = await run(await requestOf(), context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe("/iniciar-sesion");
	});
});

describe("sesiones loader — filters", () => {
	test("falls back to the shared defaults when the query string is empty", async () => {
		const { context, calls } = createHarness();

		await run(await requestOf(), context);

		expect(calls.filters[0]).toMatchObject({
			page: SESSION_LIST_DEFAULTS.page,
			pageSize: SESSION_LIST_DEFAULTS.pageSize,
		});
	});

	test("reads the filters from the URL", async () => {
		const { context, calls } = createHarness();

		await run(
			await requestOf(
				"?page=3&pageSize=25&status=expired&userId=9&sortBy=expiresAt&sortDir=asc",
			),
			context,
		);

		expect(calls.filters[0]).toMatchObject({
			page: 3,
			pageSize: 25,
			status: "expired",
			userId: 9,
			sortBy: "expiresAt",
			sortDir: "asc",
		});
	});

	// El query string lo escribe cualquiera: basura, decimales y negativos caen al
	// default en vez de llegar al repositorio.
	test("discards garbage, decimals and non-positive numbers", async () => {
		const { context, calls } = createHarness();

		await run(await requestOf("?page=abc&pageSize=-5&userId=1.5"), context);

		expect(calls.filters[0]).toMatchObject({
			page: SESSION_LIST_DEFAULTS.page,
			pageSize: SESSION_LIST_DEFAULTS.pageSize,
			userId: undefined,
		});
	});

	// La allowlist sigue mandando: una columna no declarada hace fallar la
	// validación, no se ignora en silencio.
	test("a sort column outside the allowlist throws", async () => {
		const { context } = createHarness();

		await expect(
			run(await requestOf("?sortBy=refreshTokenHash"), context),
		).rejects.toThrow();
	});

	// La cookie sirve para marcar la fila propia, no para autenticar: se pasa
	// CRUDA porque hashearla es del servicio, y el adaptador no manipula secretos.
	test("passes the raw refresh token through so the panel can mark its own row", async () => {
		const { context, calls } = createHarness();

		await run(await requestOf("", "token-crudo"), context);

		expect(calls.refreshToken).toEqual(["token-crudo"]);
	});

	test("passes undefined when there is no refresh cookie", async () => {
		const { context, calls } = createHarness();

		await run(await requestOf(), context);

		expect(calls.refreshToken).toEqual([undefined]);
	});
});

describe("sesiones loader — response", () => {
	test("returns the envelope with its pagination and the view filters", async () => {
		const { context } = createHarness();

		const result = await run(await requestOf(), context);

		expect(result.success).toBe(true);
		expect(result.pagination).toEqual({
			page: 1,
			pageSize: 10,
			total: 0,
			totalPages: 1,
		});
		expect(result.data.filters).toEqual({
			search: "",
			status: "active",
			sortBy: "createdAt",
			sortDir: "desc",
		});
	});

	// Los dos números salen del SERVIDOR y no de literales en la vista: así el
	// texto que explica las latencias no miente si cambia el entorno.
	test("surfaces the revocation and propagation windows from the config", async () => {
		const { context } = createHarness();

		const result = await run(await requestOf(), context);

		expect(result.data.revocationWindowS).toBe(300);
		expect(result.data.propagationS).toBe(5);
	});

	// Un loader que falla no tiene pantalla que mostrar: corta con el status del
	// código y deja el error al ErrorBoundary.
	test("cuts with the status of the code when the listing fails", async () => {
		const { context } = createHarness({ listFails: true });

		const thrown = await run(await requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
		expect(thrown.data.code).toBe("SESSION_NOT_FOUND");
		expect(thrown.data.message).not.toBe("técnico");
	});

	test("cuts with a 500 when the security state cannot be read", async () => {
		const { context } = createHarness({ stateFails: true });

		const thrown = await run(await requestOf(), context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toContain("db caída");
	});
});
