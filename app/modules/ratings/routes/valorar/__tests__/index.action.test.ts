import { describe, expect, test } from "vitest";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const COURSE_DOC = "11111111-1111-4111-8111-111111111111";

const authPayloadOf = (overrides: Record<string, unknown> = {}) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 50,
	email: "diana.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
	...overrides,
});

const createHarness = (authPayload: unknown = authPayloadOf()) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload,
		ratingService: {
			rate: async (...args: unknown[]) => {
				calls.push(args);
				return {
					success: true,
					data: null,
					timestamp: new Date().toISOString(),
				};
			},
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/mis-cursos/${COURSE_DOC}/valorar`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

describe("valorar action", () => {
	test("convierte la puntuación y limpia el comentario", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { score: "4", comment: "  " });

		expect(result.success).toBe(true);
		expect(calls[0]?.slice(0, 2)).toEqual([
			COURSE_DOC,
			{ score: 4, comment: null },
		]);
	});

	test("sin puntuación responde validación sin llamar al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { score: "" });

		expect(result).toMatchObject({
			success: false,
			error: { code: "VALIDATION_ERROR" },
		});
		expect(calls).toHaveLength(0);
	});

	test("un capacitador externo recibe 403", async () => {
		const { context, calls } = createHarness(
			authPayloadOf({ dependencyId: null, isTrainer: true }),
		);

		const thrown = await run(context, { score: "5" }).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls).toHaveLength(0);
	});
});
