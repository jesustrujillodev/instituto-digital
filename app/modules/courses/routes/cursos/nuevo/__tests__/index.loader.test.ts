import { describe, expect, test } from "vitest";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const LINE_DOC = "44444444-4444-4444-8444-444444444444";

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 2,
	email: "carlos.sop@instituto.gob.mx",
	role: "DEPENDENCY_DEPUTY",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const okReply = (data: unknown) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

const createHarness = (
	lineReply: unknown = okReply({ title: "Seguridad" }),
) => {
	const calls = { lines: [] as string[] };
	const context = {
		authPayload,
		courseService: {
			listFormOptions: async () => okReply({ trainers: [] }),
		},
		annualPlanService: {
			findLineForCourse: async (documentId: string) => {
				calls.lines.push(documentId);
				return lineReply;
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], query = "") =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/cursos/nuevo${query}`,
		),
		context,
		params: {},
	} as unknown as LoaderArgs);

describe("alta de curso loader", () => {
	test("sin línea no consulta el plan", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result.data.prefill).toBeNull();
		expect(calls.lines).toEqual([]);
	});

	test("con ?linea= devuelve el prellenado de la línea", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, `?linea=${LINE_DOC}`);

		expect(calls.lines).toEqual([LINE_DOC]);
		expect(result.data.prefill).toEqual({ title: "Seguridad" });
	});

	test("una línea no disponible corta con su status", async () => {
		const { context } = createHarness({
			success: false,
			error: { code: "ANNUAL_PLAN_LINE_HAS_ACTIVE_COURSE", message: "técnico" },
			timestamp: new Date().toISOString(),
		});

		const thrown = await run(context, `?linea=${LINE_DOC}`).catch((e) => e);

		expect(thrown.init.status).toBe(409);
		expect(thrown.data.code).toBe("ANNUAL_PLAN_LINE_HAS_ACTIVE_COURSE");
	});

	test("un ?linea= mal formado responde 400 sin consultar el plan", async () => {
		const { context, calls } = createHarness();

		const thrown = await run(context, "?linea=abc").catch((e) => e);

		expect(thrown.init.status).toBe(400);
		expect(calls.lines).toEqual([]);
	});
});
