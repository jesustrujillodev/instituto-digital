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
	options: ActorOptions & {
		detail?: object | null;
		findFails?: string;
		classrooms?: string[];
		sessionMaterials?: object[];
		followUps?: object[];
	} = {},
) => {
	const context = {
		authPayload: authPayloadOf(options),
		enrollmentService: {
			findMyCourse: async () =>
				options.findFails
					? failReply(options.findFails)
					: okReply(
							options.detail === undefined
								? {
										course: { documentId: COURSE_ID },
										enrollment: { status: "ENROLLED" },
									}
								: options.detail,
						),
		},
		classroomService: {
			listMine: async () => okReply(options.classrooms ?? []),
		},
		sessionMaterialService: {
			findForParticipant: async () => okReply(options.sessionMaterials ?? []),
		},
		quizService: {
			findParticipantFollowUps: async () => okReply(options.followUps ?? []),
		},
	} as unknown as LoaderArgs["context"];

	return { context };
};

const run = (context: LoaderArgs["context"], documentId = COURSE_ID) =>
	loader({
		request: getRequest(`/dashboard/mis-capacitaciones/${documentId}`),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("mis-capacitaciones/:documentId loader", () => {
	test("sin inscripción que enseñar manda a la ficha del catálogo", async () => {
		const { context } = createHarness({ detail: null });

		const thrown = await run(context).catch((error) => error);

		expect(thrown).toBeInstanceOf(Response);
		expect(thrown.status).toBe(302);
		expect(thrown.headers.get("Location")).toBe(
			`/dashboard/catalogo-de-capacitaciones/${COURSE_ID}`,
		);
	});

	test("con aula abierta ofrece entrar", async () => {
		const { context } = createHarness({ classrooms: [COURSE_ID] });

		const { data } = await run(context);

		expect(data).toMatchObject({
			course: { documentId: COURSE_ID },
			hasClassroom: true,
		});
	});

	// docs/adr/0027: también se presentan desde el detalle.
	test("entrega las evaluaciones de seguimiento", async () => {
		const followUps = [{ documentId: "f-1", availability: "NOT_YET" }];
		const { context } = createHarness({ followUps });

		const { data } = await run(context);

		expect(data).toMatchObject({ followUps });
	});

	test("entrega el material de cada sesión", async () => {
		const sessionMaterials = [{ sessionDocumentId: "s-1", materials: [] }];
		const { context } = createHarness({ sessionMaterials });

		const { data } = await run(context);

		expect(data.sessionMaterials).toEqual(sessionMaterials);
	});

	test("sin aula no ofrece entrar", async () => {
		const { context } = createHarness({ classrooms: ["otro"] });

		const { data } = await run(context);

		expect(data.hasClassroom).toBe(false);
	});

	test("quien no puede cursar recibe el error del servicio", async () => {
		const { context } = createHarness({
			findFails: "ENROLLMENT_NOT_ELIGIBLE",
		});

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(403);
	});

	test("un documentId inválido no llega al servicio", async () => {
		const { context } = createHarness();

		await expect(run(context, "no-es-uuid")).rejects.toBeDefined();
	});
});
