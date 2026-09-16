import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	failReply,
	getRequest,
	okReply,
} from "../../../__tests__/route-harness";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const createHarness = (
	options: ActorOptions & { canAssign?: boolean; findFails?: string } = {},
) => {
	const calls = { candidateSearches: [] as unknown[] };
	const context = {
		authPayload: authPayloadOf(options),
		enrollmentService: {
			findAvailable: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply({
							course: { documentId: COURSE_ID },
							enrollment: null,
							can: { assign: options.canAssign ?? false },
						}),
			listAssignCandidates: async (_id: string, search: unknown) => {
				calls.candidateSearches.push(search);
				return okReply([{ documentId: "u1" }]);
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query = "") =>
	loader({
		request: getRequest(`/dashboard/cursos-disponibles/${COURSE_ID}${query}`),
		context,
		params: { documentId: COURSE_ID },
	} as unknown as LoaderArgs);

describe("cursos-disponibles/:documentId loader", () => {
	// Criterio 3 de §7: ni por URL directa.
	test("un curso que no puede ver responde 404", async () => {
		const { context } = createHarness({
			findFails: "ENROLLMENT_COURSE_NOT_FOUND",
		});

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(404);
	});

	test("sin permiso de asignar no busca candidatos", async () => {
		const { context, calls } = createHarness();

		const { data } = await run(context, "?persona=ana");

		expect(calls.candidateSearches).toHaveLength(0);
		expect(data.candidates).toEqual([]);
	});

	test("el titular recibe los candidatos con el término de la URL", async () => {
		const { context, calls } = createHarness({
			role: "DEPENDENCY_HEAD",
			canAssign: true,
		});

		const { data } = await run(context, "?persona=ana");

		expect(calls.candidateSearches).toEqual(["ana"]);
		expect(data.personSearch).toBe("ana");
		expect(data.candidates).toHaveLength(1);
	});
});
