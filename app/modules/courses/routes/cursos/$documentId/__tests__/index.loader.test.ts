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
	options: ActorOptions & {
		status?: string;
		format?: string;
		findFails?: string;
		rosterFails?: string;
		lessonCount?: number;
	} = {},
) => {
	const calls = { summaries: 0 };

	const context = {
		authPayload: authPayloadOf(options),
		contentService: {
			summarize: async () => {
				calls.summaries += 1;
				return okReply({
					moduleCount: 1,
					lessonCount: options.lessonCount ?? 2,
					requiredLessonCount: options.lessonCount ?? 2,
				});
			},
		},
		courseService: {
			findById: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply({
							documentId: COURSE_ID,
							status: options.status ?? "DRAFT",
							modality: "IN_PERSON",
							format: options.format ?? "SCHEDULED",
							completionRule:
								options.format === "SELF_PACED" ? "CONTENT" : "ATTENDANCE",
							access: "PUBLIC",
							sessions: [],
							trainers: [],
							audience: { dependencies: [], groups: [] },
						}),
		},
		enrollmentService: {
			listRoster: async () =>
				options.rosterFails
					? failReply(options.rosterFails)
					: okReply({
							course: {
								coverUrl: null,
								enrolledCount: 3,
								capacity: 20,
								seatsLeft: 17,
								closesAt: null,
								isOpen: true,
							},
							entries: [{ status: "INVITED" }],
						}),
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], documentId = COURSE_ID) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${documentId}`,
		),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("cursos/:documentId loader", () => {
	test("un borrador trae sus pendientes para publicar", async () => {
		const { context } = createHarness();

		const { data } = await run(context);

		expect(data.can).toMatchObject({
			edit: true,
			publish: true,
			cancel: true,
			teach: false,
		});
		expect(data.publishChecklist?.map((entry) => entry.check)).toEqual([
			"sessions",
			"places",
			"trainer",
		]);
	});

	test("un curso con sesiones no pregunta por el temario", async () => {
		const { context, calls } = createHarness();

		await run(context);

		expect(calls.summaries).toBe(0);
	});

	test("un autogestivo trae el pendiente de contenido resuelto", async () => {
		const { context, calls } = createHarness({ format: "SELF_PACED" });

		const { data } = await run(context);

		expect(calls.summaries).toBe(1);
		expect(data.publishChecklist).toContainEqual({
			check: "content",
			done: true,
		});
	});

	test("un autogestivo sin lecciones no se puede publicar todavía", async () => {
		const { context } = createHarness({
			format: "SELF_PACED",
			lessonCount: 0,
		});

		const { data } = await run(context);

		expect(data.publishChecklist).toContainEqual({
			check: "content",
			done: false,
		});
	});

	test("un publicado resume la inscripción y abre la impartición", async () => {
		const { context } = createHarness({ status: "PUBLISHED" });

		const { data } = await run(context);

		expect(data.publishChecklist).toBeNull();
		expect(data.enrollment).toMatchObject({ enrolled: 3, invited: 1 });
		expect(data.can.teach).toBe(true);
	});

	test("un finalizado ya no se edita ni se cancela", async () => {
		const { context } = createHarness({ status: "FINISHED" });

		const { data } = await run(context);

		expect(data.can).toMatchObject({
			edit: false,
			publish: false,
			cancel: false,
		});
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
