import { describe, expect, test } from "vitest";
import {
	ANA_DOC,
	COURSE_DOC,
	EVALUATION_DOC,
	SESSION_DOC,
} from "../../../../../domain/__tests__/evaluation.fixtures";
import { EVALUATION_NOTE_MAX_LENGTH } from "../../../../../domain/evaluation.config";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const authPayloadOf = () => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 9,
	email: "carlos.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: true,
	iat: 1_800_000_000,
});

const okReply = (data: unknown) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

const createHarness = (reply: unknown = okReply({ affected: 2 })) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return reply;
		};

	const context = {
		authPayload: authPayloadOf(),
		evaluationService: {
			create: record("create"),
			update: record("update"),
			remove: record("remove"),
			saveResults: record("saveResults"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/imparticion/${COURSE_DOC}/evaluaciones`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

describe("evaluaciones action", () => {
	test("crear pasa el título y la sesión al servicio", async () => {
		const { context, calls } = createHarness(okReply(null));

		const result = await run(context, {
			intent: "create",
			payload: JSON.stringify({
				title: "Práctica de campo",
				sessionDocumentId: SESSION_DOC,
			}),
		});

		expect(result).toMatchObject({
			success: true,
			message: "Evaluación añadida.",
		});
		expect(calls[0].method).toBe("create");
		expect(calls[0].args.slice(0, 2)).toEqual([
			COURSE_DOC,
			{ title: "Práctica de campo", sessionDocumentId: SESSION_DOC },
		]);
	});

	test("actualizar separa el id de la evaluación del resto del dto", async () => {
		const { context, calls } = createHarness(okReply(null));

		await run(context, {
			intent: "update",
			payload: JSON.stringify({
				evaluationDocumentId: EVALUATION_DOC,
				title: "Práctica 1",
				sessionDocumentId: null,
			}),
		});

		expect(calls[0].method).toBe("update");
		expect(calls[0].args.slice(0, 3)).toEqual([
			COURSE_DOC,
			EVALUATION_DOC,
			{ title: "Práctica 1", sessionDocumentId: null },
		]);
	});

	test("eliminar avisa de que se lleva lo capturado", async () => {
		const { context, calls } = createHarness(okReply(null));

		const result = await run(context, {
			intent: "remove",
			payload: JSON.stringify({ evaluationDocumentId: EVALUATION_DOC }),
		});

		expect(result).toMatchObject({
			success: true,
			message: "Evaluación eliminada, junto con lo capturado en ella.",
		});
		expect(calls[0].args.slice(0, 2)).toEqual([COURSE_DOC, EVALUATION_DOC]);
	});

	test("guardar capturas cuenta los cambios en el mensaje", async () => {
		const { context } = createHarness();

		expect(
			await run(context, {
				intent: "results",
				payload: JSON.stringify({
					evaluationDocumentId: EVALUATION_DOC,
					entries: [{ userDocumentId: ANA_DOC, passed: true, note: "" }],
				}),
			}),
		).toMatchObject({
			success: true,
			message: "Evaluación guardada: 2 cambios.",
		});
	});

	test("sin cambios lo dice en vez de mentir", async () => {
		const { context } = createHarness(okReply({ affected: 0 }));

		expect(
			await run(context, {
				intent: "results",
				payload: JSON.stringify({
					evaluationDocumentId: EVALUATION_DOC,
					entries: [{ userDocumentId: ANA_DOC, passed: null, note: "" }],
				}),
			}),
		).toMatchObject({
			success: true,
			message: "No había cambios que guardar.",
		});
	});

	test("una observación demasiado larga no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "results",
			payload: JSON.stringify({
				evaluationDocumentId: EVALUATION_DOC,
				entries: [
					{
						userDocumentId: ANA_DOC,
						passed: true,
						note: "x".repeat(EVALUATION_NOTE_MAX_LENGTH + 1),
					},
				],
			}),
		});

		expect(result).toMatchObject({
			success: false,
			error: { code: "VALIDATION_ERROR" },
		});
		expect(calls).toEqual([]);
	});

	test("un payload que no es JSON se rechaza antes del servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "create",
			payload: "{no es json",
		});

		expect(result.success).toBe(false);
		expect(calls).toEqual([]);
	});

	test("un intent desconocido no hace nada", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { intent: "otra-cosa", payload: "{}" });

		expect(result).toMatchObject({
			success: false,
			error: { message: "Acción no reconocida." },
		});
		expect(calls).toEqual([]);
	});
});
