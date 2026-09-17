import { describe, expect, test } from "vitest";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const PLAN_DOC = "11111111-1111-4111-8111-111111111111";
const LINE_DOC = "22222222-2222-4222-8222-222222222222";

const authPayloadOf = (overrides: Record<string, unknown> = {}) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 2,
	email: "carlos.sop@instituto.gob.mx",
	role: "DEPENDENCY_DEPUTY",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
	...overrides,
});

const createHarness = (authPayload: unknown = authPayloadOf()) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args: args.slice(0, -1) });
			return { success: true, data: null, timestamp: new Date().toISOString() };
		};

	const context = {
		authPayload,
		annualPlanService: {
			addLine: record("addLine"),
			updateLine: record("updateLine"),
			cancelLine: record("cancelLine"),
			reactivateLine: record("reactivateLine"),
			deleteLine: record("deleteLine"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/plan-anual/${PLAN_DOC}`,
			{
				method: "POST",
				body: new URLSearchParams(fields),
			},
		),
		context,
		params: { documentId: PLAN_DOC },
	} as unknown as ActionArgs);

describe("plan anual action", () => {
	test("agregar una línea valida el JSON y usa el plan de la URL", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "addLine",
			payload: JSON.stringify({ title: "Excel", plannedMonth: 4 }),
		});

		expect(result).toMatchObject({ success: true, message: "Línea agregada." });
		expect(calls[0]).toMatchObject({
			method: "addLine",
			args: [PLAN_DOC, { title: "Excel", plannedMonth: 4 }],
		});
	});

	test("un mes inválido no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "addLine",
			payload: JSON.stringify({ title: "Excel", plannedMonth: 13 }),
		});

		expect(result).toMatchObject({
			success: false,
			error: { code: "VALIDATION_ERROR" },
		});
		expect(calls).toEqual([]);
	});

	test("cancelar, reactivar y borrar reciben la línea del envío", async () => {
		const { context, calls } = createHarness();

		for (const intent of ["cancelLine", "reactivateLine", "deleteLine"]) {
			await run(context, { intent, lineDocumentId: LINE_DOC });
		}

		expect(calls).toEqual([
			{ method: "cancelLine", args: [LINE_DOC] },
			{ method: "reactivateLine", args: [LINE_DOC] },
			{ method: "deleteLine", args: [LINE_DOC] },
		]);
	});

	test("un participante recibe 403", async () => {
		const { context, calls } = createHarness(authPayloadOf({ role: "USER" }));

		const thrown = await run(context, {
			intent: "cancelLine",
			lineDocumentId: LINE_DOC,
		}).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual([]);
	});
});
