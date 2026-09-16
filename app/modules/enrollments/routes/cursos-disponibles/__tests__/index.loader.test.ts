import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	getRequest,
	okReply,
} from "../../__tests__/route-harness";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const createHarness = (options: ActorOptions = {}) => {
	const calls = { filters: [] as unknown[] };
	const context = {
		authPayload: authPayloadOf(options),
		enrollmentService: {
			listAvailable: async (filters: unknown) => {
				calls.filters.push(filters);
				return {
					...okReply([]),
					pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
				};
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query = "") =>
	loader({
		request: getRequest(`/dashboard/cursos-disponibles${query}`),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("cursos-disponibles loader", () => {
	test("lee búsqueda, modalidad y página del query string", async () => {
		const { context, calls } = createHarness();

		const { data } = await run(context, "?search=ética&modality=ONLINE&page=2");

		expect(calls.filters[0]).toMatchObject({
			search: "ética",
			modality: "ONLINE",
			page: 2,
		});
		expect(data.filters).toEqual({ search: "ética", modality: "ONLINE" });
	});

	test.each([
		["un capacitador externo", { dependencyId: null, isTrainer: true }],
		["el superadministrador", { role: "SUPERADMIN", dependencyId: null }],
	] as const)("%s recibe 403", async (_label, options) => {
		const { context, calls } = createHarness(options);

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls.filters).toHaveLength(0);
	});
});
