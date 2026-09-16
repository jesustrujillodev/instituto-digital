import { describe, expect, test } from "vitest";
import type { Role } from "@/shared/rules/atoms.rules";
import { CLOUD_ERROR_CODES } from "../../../domain/cloud.errors";
import type { CloudListInput } from "../../../domain/cloud.types";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const BASE = "https://app.example.com/dashboard/nube";

const createHarness = (
	options: { role?: Role | null; failWith?: string } = {},
) => {
	const calls: CloudListInput[] = [];

	const context = {
		authPayload:
			options.role === null
				? null
				: {
						sub: "11111111-1111-4111-8111-111111111111",
						userId: 7,
						email: "admin@test.com",
						role: options.role ?? "ADMIN",
						iat: 1_800_000_000,
					},
		cloudService: {
			list: async (input: CloudListInput) => {
				calls.push(input);
				return options.failWith
					? {
							success: false as const,
							error: { code: options.failWith, message: "técnico" },
							timestamp: new Date().toISOString(),
						}
					: {
							success: true as const,
							data: {
								path: input.path,
								trail: [],
								folders: [],
								objects: [],
								nextCursor: null,
							},
							timestamp: new Date().toISOString(),
						};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (url: string, context: LoaderArgs["context"]) =>
	loader({ request: new Request(url), context } as LoaderArgs);

describe("nube loader", () => {
	test("un rol insuficiente corta con 403 antes de listar", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(BASE, context).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual([]);
	});

	test("sin parámetros lista la raíz", async () => {
		const { context, calls } = createHarness();

		const result = await run(BASE, context);

		expect(calls).toEqual([{ path: "" }]);
		expect(result.data).toMatchObject({ configured: true });
	});

	test("lee carpeta y cursor de la URL", async () => {
		const { context, calls } = createHarness();

		await run(`${BASE}?path=media%2Fcursos%2F&cursor=abc`, context);

		expect(calls).toEqual([{ path: "media/cursos/", cursor: "abc" }]);
	});

	test("una ruta con .. es un 400, no un listado", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(`${BASE}?path=media%2F..%2F`, context).catch(
			(error) => error,
		);

		expect(thrown.init.status).toBe(400);
		expect(calls).toEqual([]);
	});

	test("sin storage configurado pinta la pantalla vacía en vez de un error", async () => {
		const { context } = createHarness({
			failWith: CLOUD_ERROR_CODES.NOT_CONFIGURED,
		});

		const result = await run(BASE, context);

		expect(result.data).toEqual({ configured: false, path: "" });
	});

	test("cualquier otro fallo corta con error de ruta", async () => {
		const { context } = createHarness({ failWith: "UNEXPECTED_ERROR" });

		const thrown = await run(BASE, context).catch((error) => error);

		expect(thrown.init.status).toBe(500);
	});
});
