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

const courseOf = (status: string) => ({
	documentId: COURSE_ID,
	status,
	title: "Ofimática básica",
	modality: "IN_PERSON",
	access: "PUBLIC",
	sessions: [],
	trainers: [],
	audience: { dependencies: [], groups: [] },
});

const createHarness = (
	options: ActorOptions & { status?: string; findFails?: string } = {},
) => {
	const context = {
		authPayload: authPayloadOf(options),
		courseService: {
			findById: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply(courseOf(options.status ?? "DRAFT")),
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
	{ documentId = COURSE_ID, paso = "2" } = {},
) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${documentId}/nuevo/${paso}`,
		),
		context,
		params: { documentId, paso },
	} as unknown as LoaderArgs);

describe("cursos/alta loader", () => {
	test("un borrador abre el paso con sus opciones y su checklist", async () => {
		const { context } = createHarness();

		const { data } = await run(context);

		expect(data.stepNumber).toBe(2);
		expect(data.course).toMatchObject({ documentId: COURSE_ID });
		expect(data.checklist).toContainEqual({ check: "sessions", done: false });
	});

	test.each(["0", "6", "dos"])("el paso %s vuelve al primero", async (paso) => {
		const { context } = createHarness();

		const thrown = await run(context, { paso }).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/nuevo/1`,
		);
	});

	// El alta es para capturar de cero. Un curso que ya salió de borrador se
	// corrige por campo, no recorriendo pasos.
	test("un publicado lleva a su formulario de edición", async () => {
		const { context } = createHarness({ status: "PUBLISHED" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/editar`,
		);
	});

	test("un cancelado lleva a su ficha, que es lo único que le queda", async () => {
		const { context } = createHarness({ status: "CANCELLED" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}`,
		);
	});

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
