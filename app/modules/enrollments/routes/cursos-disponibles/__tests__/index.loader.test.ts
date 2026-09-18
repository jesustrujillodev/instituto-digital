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
					...okReply({ courses: [], organizers: [] }),
					pagination: { page: 1, pageSize: 12, total: 0, totalPages: 1 },
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
	const DEPENDENCY = "44444444-4444-4444-8444-444444444444";

	test("lee búsqueda, modalidad, dependencia y página del query string", async () => {
		const { context, calls } = createHarness();

		const { data } = await run(
			context,
			`?search=ética&modality=ONLINE&dependency=${DEPENDENCY}&page=2`,
		);

		expect(calls.filters[0]).toMatchObject({
			search: "ética",
			modality: "ONLINE",
			dependency: DEPENDENCY,
			page: 2,
		});
		expect(data.filters).toEqual({
			search: "ética",
			modality: "ONLINE",
			dependency: DEPENDENCY,
		});
	});

	test("sin filtros en la URL los devuelve vacíos, no ausentes", async () => {
		// La pantalla los usa como valor controlado de sus campos: `undefined`
		// convertiría el buscador en un input no controlado a mitad de vida.
		const { context } = createHarness();

		const { data } = await run(context);

		expect(data.filters).toEqual({
			search: "",
			modality: "",
			dependency: "",
		});
	});

	test("pasa el catálogo y las opciones del filtro tal como llegan", async () => {
		const { context } = createHarness();

		const { data } = await run(context);

		expect(data).toMatchObject({ courses: [], organizers: [] });
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
