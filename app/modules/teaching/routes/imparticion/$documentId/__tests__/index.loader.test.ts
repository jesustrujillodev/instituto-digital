import { describe, expect, test } from "vitest";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const COURSE_DOC = "11111111-1111-4111-8111-111111111111";

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 2,
	email: "laura.sop@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const okReply = (data: unknown) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

const MODULE_QUIZ = {
	quizDocumentId: "22222222-2222-4222-8222-222222222222",
	owner: {
		lessonDocumentId: null,
		moduleDocumentId: "33333333-3333-4333-8333-333333333333",
	},
	kind: "MODULE",
	ownerTitle: "Fundamentos",
	title: "Evaluación",
	maxAttempts: 1,
};

const FINAL_QUIZ = {
	quizDocumentId: "44444444-4444-4444-8444-444444444444",
	owner: { lessonDocumentId: null, moduleDocumentId: null },
	kind: "FINAL",
	ownerTitle: null,
	title: "Examen final",
	maxAttempts: 3,
};

const FOLLOW_UP = {
	documentId: "55555555-5555-4555-8555-555555555555",
	title: "Práctica de la sesión 2",
	sessionDocumentId: "33333333-3333-4333-8333-333333333333",
	countsTowardGrade: true,
};

const createHarness = (
	status: string,
	requiresEvaluation = false,
	format = "SCHEDULED",
	quizzes: unknown[] = [],
	followUps: unknown[] = [],
) => {
	const calls = { ratings: 0, followUps: 0, quizBoard: 0 };
	const context = {
		authPayload,
		teachingService: {
			findById: async () =>
				okReply({
					course: {
						status,
						requiresEvaluation,
						format,
						completionRule: format === "SELF_PACED" ? "CONTENT" : "ATTENDANCE",
					},
					participants: [],
				}),
		},
		ratingService: {
			findCourseSummary: async () => {
				calls.ratings += 1;
				return okReply({ average: 4.5, count: 2, comments: [] });
			},
		},
		quizService: {
			findFollowUpBoard: async () => {
				calls.followUps += 1;
				return okReply({ canToggle: true, followUps, scores: [] });
			},
			findQuizBoard: async () => {
				calls.quizBoard += 1;
				return okReply({ canGrantRetake: true, quizzes, attempts: [] });
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], documentId = COURSE_DOC) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/imparticion/${documentId}`,
		),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("ficha de impartición loader", () => {
	test("un curso publicado no consulta valoraciones", async () => {
		const { context, calls } = createHarness("PUBLISHED");

		const result = await run(context);

		expect(result.data.ratings).toBeNull();
		expect(calls.ratings).toBe(0);
	});

	// docs/adr/0014: no se finaliza nunca, y cada quien valora al completarlo.
	test("un autogestivo publicado ya trae sus valoraciones", async () => {
		const { context, calls } = createHarness("PUBLISHED", false, "SELF_PACED");

		await run(context);

		expect(calls.ratings).toBe(1);
	});

	test("un curso finalizado trae su resumen de valoraciones", async () => {
		const { context } = createHarness("FINISHED");

		const result = await run(context);

		expect(result.data.ratings).toEqual({
			average: 4.5,
			count: 2,
			comments: [],
		});
	});

	test("sin evaluaciones de seguimiento el tablero no viaja", async () => {
		const { context, calls } = createHarness("PUBLISHED", true);

		const result = await run(context);

		expect(result.data.followUps).toBeNull();
		expect(calls.followUps).toBe(1);
	});

	test("las de seguimiento no dependen de la evaluación final", async () => {
		const { context } = createHarness(
			"PUBLISHED",
			false,
			"SCHEDULED",
			[],
			[FOLLOW_UP],
		);

		const result = await run(context);

		expect(result.data.followUps).toEqual({
			canToggle: true,
			followUps: [FOLLOW_UP],
			scores: [],
		});
	});

	// docs/adr/0027: el seguimiento que cuenta califica la capacitación.
	test("con seguimiento que cuenta, la pestaña Resultados aparece", async () => {
		const withFollowUp = createHarness(
			"PUBLISHED",
			false,
			"SCHEDULED",
			[],
			[FOLLOW_UP],
		);
		const plain = createHarness("PUBLISHED");

		expect((await run(withFollowUp.context)).data.gradesAutomatically).toBe(
			true,
		);
		expect((await run(plain.context)).data.gradesAutomatically).toBe(false);
	});

	test("un autogestivo no consulta evaluaciones de seguimiento", async () => {
		const { context, calls } = createHarness("PUBLISHED", true, "SELF_PACED");

		const result = await run(context);

		expect(result.data.followUps).toBeNull();
		expect(calls.followUps).toBe(0);
	});

	// docs/adr/0016: las evaluaciones de módulo viven donde cuenta el temario.
	test("un autogestivo con evaluaciones de módulo trae su tablero", async () => {
		const { context, calls } = createHarness("PUBLISHED", false, "SELF_PACED", [
			MODULE_QUIZ,
		]);

		const result = await run(context);

		expect(result.data.quizBoard).toEqual({
			canGrantRetake: true,
			quizzes: [MODULE_QUIZ],
			attempts: [],
		});
		expect(calls.quizBoard).toBe(1);
	});

	test("sin cuestionarios el tablero no viaja", async () => {
		const { context } = createHarness("PUBLISHED", false, "SELF_PACED");

		expect((await run(context)).data.quizBoard).toBeNull();
	});

	// docs/adr/0024: al examen final también se le habilita otro intento.
	test("un curso por asistencia con examen en línea trae el tablero", async () => {
		const { context, calls } = createHarness("PUBLISHED", true, "SCHEDULED", [
			FINAL_QUIZ,
		]);

		expect((await run(context)).data.quizBoard?.quizzes).toEqual([FINAL_QUIZ]);
		expect(calls.quizBoard).toBe(1);
	});

	// docs/adr/0027: con sesiones puede haber seguimiento al que dar otro intento.
	test("un calendarizado sin cuestionarios consulta el tablero pero no lo envía", async () => {
		const { context, calls } = createHarness("PUBLISHED");

		expect((await run(context)).data.quizBoard).toBeNull();
		expect(calls.quizBoard).toBe(1);
	});

	test("un documentId mal formado responde 400", async () => {
		const { context } = createHarness("PUBLISHED");

		const thrown = await run(context, "no-es-uuid").catch((error) => error);

		expect(thrown.init.status).toBe(400);
	});
});
