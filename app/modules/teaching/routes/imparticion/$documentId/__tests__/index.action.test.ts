import { describe, expect, test } from "vitest";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const COURSE_DOC = "11111111-1111-4111-8111-111111111111";
const SESSION_DOC = "21111111-1111-4111-8111-111111111111";
const ANA_DOC = "31111111-1111-4111-8111-111111111111";

const authPayloadOf = (overrides: Record<string, unknown> = {}) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 9,
	email: "carlos.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: true,
	iat: 1_800_000_000,
	...overrides,
});

const okReply = (data: unknown) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

const createHarness = (
	reply: unknown = okReply({ affected: 2 }),
	authPayload: unknown = authPayloadOf(),
) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return reply;
		};

	const context = {
		authPayload,
		teachingService: {
			saveAttendance: record("saveAttendance"),
			saveResults: record("saveResults"),
			finish: record("finish"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/imparticion/${COURSE_DOC}`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

describe("impartición action", () => {
	test("la lista llega como JSON y se valida antes del servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "attendance",
			payload: JSON.stringify({
				sessionDocumentId: SESSION_DOC,
				marks: [{ userDocumentId: ANA_DOC, attended: true }],
			}),
		});

		expect(result).toMatchObject({
			success: true,
			message: "Lista guardada: 2 cambios.",
		});
		expect(calls[0].method).toBe("saveAttendance");
		expect(calls[0].args.slice(0, 2)).toEqual([
			COURSE_DOC,
			{
				sessionDocumentId: SESSION_DOC,
				marks: [{ userDocumentId: ANA_DOC, attended: true }],
			},
		]);
	});

	test("un JSON roto responde error de validación sin llamar al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { intent: "results", payload: "{roto" });

		expect(result).toMatchObject({
			success: false,
			error: { code: "VALIDATION_ERROR" },
		});
		expect(calls).toHaveLength(0);
	});

	test("el error del servicio se localiza conservando el código", async () => {
		const { context } = createHarness({
			success: false,
			error: {
				code: "TEACHING_PENDING_RESULTS",
				message: "técnico",
				details: { pending: 2 },
			},
			timestamp: new Date().toISOString(),
		});

		const result = await run(context, { intent: "finish" });

		expect(result).toMatchObject({
			success: false,
			error: {
				code: "TEACHING_PENDING_RESULTS",
				message: "Falta capturar el resultado de 2 persona(s).",
			},
		});
	});

	test("un participante sin perfil recibe 403 antes de leer el envío", async () => {
		const { context, calls } = createHarness(
			undefined,
			authPayloadOf({ isTrainer: false }),
		);

		const thrown = await run(context, { intent: "finish" }).catch(
			(error) => error,
		);

		expect(thrown.init.status).toBe(403);
		expect(calls).toHaveLength(0);
	});

	test("un intent desconocido no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { intent: "borrar" });

		expect(result.success).toBe(false);
		expect(calls).toHaveLength(0);
	});
});
