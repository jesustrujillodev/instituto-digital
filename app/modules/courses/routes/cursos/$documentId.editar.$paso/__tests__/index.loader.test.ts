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
		evaluationService: {
			findDefinitions: async () => okReply([]),
		},
		courseService: {
			findById: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply({
							documentId: COURSE_ID,
							status: options.status ?? "PUBLISHED",
							title: "Ofimática básica",
							modality: "IN_PERSON",
							format: "SCHEDULED",
							completionRule: "ATTENDANCE",
							access: "PUBLIC",
							sessions: [],
							trainers: [],
							audience: { dependencies: [], groups: [] },
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

const run = (
	context: LoaderArgs["context"],
	// `paso: ""` es la URL sin segmento de paso.
	{ documentId = COURSE_ID, paso = "1", search = "" } = {},
) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${documentId}/editar${paso ? `/${paso}` : ""}${search}`,
		),
		context,
		params: { documentId, paso: paso || undefined },
	} as unknown as LoaderArgs);

describe("cursos/edición loader", () => {
	test("un publicado abre el paso sin checklist de alta", async () => {
		const { context } = createHarness();

		const { data } = await run(context, { paso: "2" });

		expect(data.stepNumber).toBe(2);
		expect(data.course).toMatchObject({ documentId: COURSE_ID });
		expect(data.checklist).toBeNull();
	});

	test("sin paso empieza por el primero y conserva a dónde se vuelve", async () => {
		const { context } = createHarness();

		const thrown = await run(context, {
			paso: "",
			search: "?volver=imparticion",
		}).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/editar/1?volver=imparticion`,
		);
	});

	// La edición no publica: su último paso es Inscripción.
	test("la revisión no existe en la edición", async () => {
		const { context } = createHarness();

		const thrown = await run(context, { paso: "6" }).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/editar/1`,
		);
	});

	test("un borrador lleva a su alta", async () => {
		const { context } = createHarness({ status: "DRAFT" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/nuevo/1`,
		);
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
