import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
} from "../../__tests__/route-harness";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const createHarness = (
	options: ActorOptions & { status?: string; findFails?: string } = {},
) => {
	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			findById: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply({
							documentId: COURSE_ID,
							status: options.status ?? "DRAFT",
						}),
			listFormOptions: async () =>
				okReply({
					trainers: [],
					organizers: [],
					audienceDependencies: [],
					audienceGroups: [],
					canChooseOrganizer: false,
				}),
		},
	} as unknown as LoaderArgs["context"];

	return { context };
};

const run = (context: LoaderArgs["context"], documentId = COURSE_ID) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${documentId}/editar`,
		),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("cursos/editar loader", () => {
	test("un borrador se abre con sus opciones", async () => {
		const { context } = createHarness();

		const { data } = await run(context);

		expect(data.course).toMatchObject({ documentId: COURSE_ID });
	});

	test("un cancelado lleva a su ficha en vez de al formulario", async () => {
		const { context } = createHarness({ status: "CANCELLED" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.status).toBe(302);
		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}`,
		);
	});

	// Criterio 3 de §7: ni por URL directa. Fuera de alcance es 404, igual que
	// inexistente, para no confirmar que el curso existe.
	test("un curso fuera de alcance responde 404", async () => {
		const { context } = createHarness({ findFails: "COURSE_NOT_FOUND" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(404);
	});

	test("un participante recibe 403 antes de buscar nada", async () => {
		const { context } = createHarness({ role: "USER" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
	});
});
