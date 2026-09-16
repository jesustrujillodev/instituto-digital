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

const createHarness = (status: string) => {
	const calls = { ratings: 0 };
	const context = {
		authPayload,
		teachingService: {
			findById: async () => okReply({ course: { status }, participants: [] }),
		},
		ratingService: {
			findCourseSummary: async () => {
				calls.ratings += 1;
				return okReply({ average: 4.5, count: 2, comments: [] });
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

	test("un curso finalizado trae su resumen de valoraciones", async () => {
		const { context } = createHarness("FINISHED");

		const result = await run(context);

		expect(result.data.ratings).toEqual({
			average: 4.5,
			count: 2,
			comments: [],
		});
	});

	test("un documentId mal formado responde 400", async () => {
		const { context } = createHarness("PUBLISHED");

		const thrown = await run(context, "no-es-uuid").catch((error) => error);

		expect(thrown.init.status).toBe(400);
	});
});
