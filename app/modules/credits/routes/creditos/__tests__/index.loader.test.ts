import { describe, expect, test } from "vitest";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const DEPENDENCY_DOC = "44444444-4444-4444-8444-444444444444";

const authPayloadOf = (overrides: Record<string, unknown> = {}) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 2,
	email: "laura.sop@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
	...overrides,
});

const createHarness = (authPayload: unknown = authPayloadOf()) => {
	const calls = { queries: [] as unknown[] };
	const context = {
		authPayload,
		clock: { now: () => new Date("2026-09-16T18:00:00.000Z") },
		creditService: {
			listOverview: async (query: unknown) => {
				calls.queries.push(query);
				return {
					success: true,
					data: { view: "dependencies", fiscalYear: 2026, rows: [] },
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query = "") =>
	loader({
		request: new Request(`https://app.example.com/dashboard/creditos${query}`),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("créditos loader", () => {
	test("fuera del alcance global el filtro de dependencia ni se lee", async () => {
		const { context, calls } = createHarness();

		await run(context, `?dependencia=${DEPENDENCY_DOC}&ejercicio=2025`);

		expect(calls.queries[0]).toMatchObject({ fiscalYear: 2025 });
		expect(calls.queries[0]).not.toHaveProperty("dependency", DEPENDENCY_DOC);
	});

	test("el superadministrador sí filtra por dependencia", async () => {
		const { context, calls } = createHarness(
			authPayloadOf({ role: "SUPERADMIN", dependencyId: null }),
		);

		await run(context, `?dependencia=${DEPENDENCY_DOC}`);

		expect(calls.queries[0]).toMatchObject({ dependency: DEPENDENCY_DOC });
	});

	test("un participante recibe 403", async () => {
		const { context, calls } = createHarness(authPayloadOf({ role: "USER" }));

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls.queries).toHaveLength(0);
	});
});
