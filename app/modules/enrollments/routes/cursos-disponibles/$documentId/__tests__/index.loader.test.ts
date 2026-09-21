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

const createHarness = (options: ActorOptions & { findFails?: string } = {}) => {
	const context = {
		authPayload: authPayloadOf(options),
		enrollmentService: {
			findAvailable: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply({
							course: { documentId: COURSE_ID },
							enrollment: null,
							can: { assign: true },
						}),
		},
	} as unknown as LoaderArgs["context"];

	return { context };
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

	test("la ficha solo trae el detalle: inscribir personal vive en su propia vista", async () => {
		const { context } = createHarness({ role: "DEPENDENCY_HEAD" });

		const { data } = await run(context);

		expect(data).toEqual({
			course: { documentId: COURSE_ID },
			enrollment: null,
			can: { assign: true },
		});
	});
});
