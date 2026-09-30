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
		certificateState?: string;
		certificateFails?: string;
		access?: string;
		enrollmentQrFails?: string;
	} = {},
) => {
	const calls = { summaries: 0, certificateLookups: 0, enrollmentQrLookups: 0 };

	const context = {
		authPayload: authPayloadOf(options),
		enrollmentQrService: {
			find: async () => {
				calls.enrollmentQrLookups += 1;
				return options.enrollmentQrFails
					? failReply(options.enrollmentQrFails)
					: okReply({ token: null, rotatedAt: null, enrollmentOpen: true });
			},
		},
		certificateService: {
			getEditor: async () => {
				calls.certificateLookups += 1;
				return options.certificateFails
					? failReply(options.certificateFails)
					: okReply({ state: options.certificateState ?? "never-published" });
			},
		},
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
							access: options.access ?? "PUBLIC",
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
			`https://app.example.com/dashboard/capacitaciones/${documentId}`,
		),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("capacitaciones/:documentId loader", () => {
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

describe("capacitaciones/:documentId loader — QR de inscripción", () => {
	test("un publicado público trae el estado de su QR", async () => {
		const { context } = createHarness({ status: "PUBLISHED" });

		const { data } = await run(context);

		expect(data.enrollmentQr).toEqual({
			token: null,
			rotatedAt: null,
			enrollmentOpen: true,
		});
	});

	test.each([
		["un borrador", { status: "DRAFT" }],
		["un curso por invitación", { status: "PUBLISHED", access: "INVITATION" }],
		["un finalizado", { status: "FINISHED" }],
	])("%s no ofrece QR ni lo consulta", async (_, options) => {
		const { context, calls } = createHarness(options);

		const { data } = await run(context);

		expect(data.enrollmentQr).toBeNull();
		expect(calls.enrollmentQrLookups).toBe(0);
	});

	test("un rechazo del QR corta con su status", async () => {
		const { context } = createHarness({
			status: "PUBLISHED",
			enrollmentQrFails: "ENROLLMENT_QR_FORBIDDEN_SCOPE",
		});

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(403);
	});
});

describe("capacitaciones/:documentId loader — certificado", () => {
	// Es lo que hacía que un curso emitiera el diseño por defecto sin que nadie
	// lo notara: la ficha tiene que decir que el certificado no está publicado.
	test("trae el estado del certificado", async () => {
		const { context } = createHarness({ status: "PUBLISHED" });

		const { data } = await run(context);

		expect(data.certificateState).toBe("never-published");
	});

	test("un curso cancelado no consulta el certificado", async () => {
		const { context, calls } = createHarness({ status: "CANCELLED" });

		const { data } = await run(context);

		expect(data.certificateState).toBeNull();
		expect(calls.certificateLookups).toBe(0);
	});

	test("un fallo del certificado corta sin exponer su mensaje", async () => {
		const { context } = createHarness({
			status: "PUBLISHED",
			certificateFails: "UNEXPECTED_ERROR",
		});

		const thrown = await run(context).catch((e) => e);

		expect(thrown.init.status).toBe(500);
		expect(thrown.data.message).not.toBe("técnico");
	});
});
