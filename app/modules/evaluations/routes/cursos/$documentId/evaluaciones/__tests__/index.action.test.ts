import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	EVALUATION_DOC,
	SESSION_DOC,
} from "../../../../../domain/__tests__/evaluation.fixtures";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const authPayloadOf = (isTrainer: boolean) => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 9,
	email: "carlos.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer,
	iat: 1_800_000_000,
});

const okReply = (data: unknown) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

const createHarness = (reply: unknown = okReply(null), isTrainer = true) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return reply;
		};

	const context = {
		authPayload: authPayloadOf(isTrainer),
		evaluationService: {
			create: record("create"),
			update: record("update"),
			remove: record("remove"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${COURSE_DOC}/evaluaciones`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

describe("cursos/evaluaciones action", () => {
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

	// Capturar es de quien imparte, en su ficha; aquí solo se define.
	test("capturar resultados no se acepta aquí", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "results",
			payload: JSON.stringify({
				evaluationDocumentId: EVALUATION_DOC,
				entries: [],
			}),
		});

		expect(result).toMatchObject({
			success: false,
			error: { message: "Acción no reconocida." },
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

	test("un participante sin cursos a su cargo recibe 403", async () => {
		const { context, calls } = createHarness(okReply(null), false);

		const thrown = await run(context, {
			intent: "create",
			payload: JSON.stringify({ title: "Práctica de campo" }),
		}).catch((e) => e);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual([]);
	});
});
