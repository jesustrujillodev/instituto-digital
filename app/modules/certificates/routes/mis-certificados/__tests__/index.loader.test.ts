import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const createHarness = (options: ActorOptions = {}) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload: authPayloadOf(options),
		certificateService: {
			listMine: async (...args: unknown[]) => {
				calls.push(args);
				return okReply([]);
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query = "") =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/mis-certificados${query}`,
		),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("mis certificados loader", () => {
	test("pide solo los de quien está en sesión, aunque la URL diga otra cosa", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const result = await run(context, "?userId=1&documentId=otro");

		expect(result).toMatchObject({ success: true, data: { certificates: [] } });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toHaveLength(1);
		expect(calls[0][0]).toMatchObject({ userId: 7 });
	});

	// Un externo sin dependencia no cursa por el catálogo, pero sí recibe
	// certificado: su correo lo trae aquí.
	test("un externo sin dependencia también entra", async () => {
		const { context, calls } = createHarness({
			role: "USER",
			dependencyId: null,
		});

		await run(context);

		expect(calls).toHaveLength(1);
	});

	test("sin sesión redirige al inicio de sesión", async () => {
		const { context, calls } = createHarness({ role: null });

		const thrown = await run(context).catch((error) => error);

		expect(thrown.status).toBe(302);
		expect(calls).toEqual([]);
	});
});
