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

const courseOf = (status: string, format = "SCHEDULED") => ({
	documentId: COURSE_ID,
	status,
	title: "Ofimática básica",
	modality: "IN_PERSON",
	format,
	completionRule: format === "SELF_PACED" ? "CONTENT" : "ATTENDANCE",
	access: "PUBLIC",
	sessions: [],
	trainers: [],
	audience: { dependencies: [], groups: [] },
});

const moduleOf = () => ({
	documentId: "11111111-1111-4111-8111-111111111111",
	title: "Fundamentos",
	description: null,
	order: 1,
	lessons: [
		{
			documentId: "33333333-3333-4333-8333-333333333333",
			title: "Qué es la transparencia",
			type: "TEXT",
			order: 1,
			isRequired: true,
			estimatedMinutes: null,
		},
	],
});

const createHarness = (
	options: ActorOptions & {
		status?: string;
		format?: string;
		findFails?: string;
		lessons?: boolean;
	} = {},
) => {
	const calls = { trees: 0, evaluations: 0 };

	const context = {
		authPayload: authPayloadOf(options),
		contentService: {
			findTree: async () => {
				calls.trees += 1;
				return okReply(options.lessons === false ? [] : [moduleOf()]);
			},
		},
		quizService: {
			findBank: async () => okReply(null),
		},
		evaluationService: {
			findDefinitions: async () => {
				calls.evaluations += 1;
				return okReply([
					{
						documentId: "44444444-4444-4444-8444-444444444444",
						title: "Examen parcial",
						sessionDocumentId: null,
						captures: {},
						recorded: 0,
					},
				]);
			},
		},
		courseService: {
			findById: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply(
							courseOf(
								options.status ?? "DRAFT",
								options.format ?? "SCHEDULED",
							),
						),
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

	return { context, calls };
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

	test.each(["0", "7", "dos"])("el paso %s vuelve al primero", async (paso) => {
		const { context } = createHarness();

		const thrown = await run(context, { paso }).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/nuevo/1`,
		);
	});

	// El 3 existe, pero un curso con sesiones no lo recorre: va a lo que falta.
	test("el paso de contenido no es alcanzable en un calendarizado", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, { paso: "3" }).catch((e) => e);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/nuevo/2`,
		);
		expect(calls.trees).toBe(0);
	});

	test("un autogestivo abre el paso de contenido con su temario", async () => {
		const { context, calls } = createHarness({ format: "SELF_PACED" });

		const { data } = await run(context, { paso: "3" });

		expect(data.stepNumber).toBe(3);
		expect(data.content).toHaveLength(1);
		expect(calls.trees).toBe(1);
		expect(data.checklist).toContainEqual({ check: "content", done: true });
	});

	test("un autogestivo sin lecciones deja el contenido pendiente", async () => {
		const { context } = createHarness({
			format: "SELF_PACED",
			lessons: false,
		});

		const { data } = await run(context, { paso: "3" });

		expect(data.checklist).toContainEqual({ check: "content", done: false });
	});

	// El alta es para capturar de cero: un curso que ya salió de borrador se
	// recorre en la edición, que no tiene revisión ni publica.
	test("un publicado lleva al primer paso de su edición", async () => {
		const { context } = createHarness({ status: "PUBLISHED" });

		const thrown = await run(context).catch((e) => e);

		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/cursos/${COURSE_ID}/editar/1`,
		);
	});

	test("el paso de evaluación trae las evaluaciones de seguimiento", async () => {
		const { context, calls } = createHarness();

		const { data } = await run(context, { paso: "4" });

		expect(data.evaluations).toEqual([
			expect.objectContaining({ title: "Examen parcial" }),
		]);
		expect(calls.evaluations).toBe(1);
	});

	test("los pasos que no las muestran no leen evaluaciones", async () => {
		const { context, calls } = createHarness();

		const { data } = await run(context, { paso: "2" });

		expect(data.evaluations).toEqual([]);
		expect(calls.evaluations).toBe(0);
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
