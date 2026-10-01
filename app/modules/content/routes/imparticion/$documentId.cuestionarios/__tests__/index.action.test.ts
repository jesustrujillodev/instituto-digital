import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	MODULE_A,
	OTHER_DOC,
} from "../../../../domain/__tests__/content.fixtures";
import { CONTENT_ERROR_CODES } from "../../../../domain/content.errors";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 9,
	email: "carlos.sop@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: true,
	iat: 1_800_000_000,
};

const reply = (success: boolean) =>
	success
		? { success: true, data: null, timestamp: new Date().toISOString() }
		: {
				success: false,
				error: {
					code: CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED,
					message: "Only a failed latest module quiz attempt can be retaken",
				},
				timestamp: new Date().toISOString(),
			};

const run = (fields: Record<string, string>, success = true) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload,
		quizService: {
			grantRetake: async (...args: unknown[]) => {
				calls.push(args);
				return reply(success);
			},
			openFollowUp: async (...args: unknown[]) => {
				calls.push(["open", ...args]);
				return reply(success);
			},
			closeFollowUp: async (...args: unknown[]) => {
				calls.push(["close", ...args]);
				return reply(success);
			},
		},
	} as unknown as ActionArgs["context"];

	const result = action({
		request: new Request(
			`https://app.example.com/dashboard/imparticion/${COURSE_DOC}/cuestionarios`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

	return { result, calls };
};

const grant = {
	intent: "grant-retake",
	payload: JSON.stringify({
		lessonDocumentId: null,
		moduleDocumentId: MODULE_A,
		userDocumentId: OTHER_DOC,
	}),
};

describe("imparticion/cuestionarios action", () => {
	test("habilita otro intento y lo anuncia", async () => {
		const { result, calls } = run(grant);

		expect(await result).toMatchObject({
			success: true,
			message: "Otro intento habilitado.",
		});
		expect(calls[0]?.slice(0, 2)).toEqual([
			COURSE_DOC,
			{
				lessonDocumentId: null,
				moduleDocumentId: MODULE_A,
				followUpDocumentId: null,
				userDocumentId: OTHER_DOC,
			},
		]);
	});

	// docs/adr/0024: el examen final también recibe otro intento.
	test("el del examen final viaja sin lección ni módulo", async () => {
		const { result, calls } = run({
			intent: "grant-retake",
			payload: JSON.stringify({
				lessonDocumentId: null,
				moduleDocumentId: null,
				userDocumentId: OTHER_DOC,
			}),
		});

		expect(await result).toMatchObject({ success: true });
		expect(calls[0]?.[1]).toEqual({
			lessonDocumentId: null,
			moduleDocumentId: null,
			followUpDocumentId: null,
			userDocumentId: OTHER_DOC,
		});
	});

	test("el rechazo del servicio llega localizado", async () => {
		const { result } = run(grant, false);

		expect(await result).toMatchObject({
			success: false,
			error: {
				code: CONTENT_ERROR_CODES.QUIZ_RETAKE_NOT_ALLOWED,
				message:
					"Solo se habilita otro intento en una capacitación en curso, a quien no lo ha acreditado, cuando el último quedó reprobado, agotó sus intentos y no tiene otro pendiente.",
			},
		});
	});

	test("un cuerpo sin persona no llega al servicio", async () => {
		const { result, calls } = run({
			intent: "grant-retake",
			payload: JSON.stringify({ moduleDocumentId: MODULE_A }),
		});

		expect(await result).toMatchObject({ success: false });
		expect(calls).toEqual([]);
	});

	test("otra acción no se reconoce", async () => {
		const { result, calls } = run({ ...grant, intent: "save-quiz" });

		expect(await result).toMatchObject({ success: false });
		expect(calls).toEqual([]);
	});
});

// docs/adr/0027: quien imparte abre y cierra el seguimiento manual.
describe("imparticion/cuestionarios action: seguimiento manual", () => {
	const payload = JSON.stringify({
		followUpDocumentId: "44444444-4444-4444-8444-444444444444",
	});

	test("abre la evaluación", async () => {
		const { result, calls } = run({ intent: "open-follow-up", payload });

		expect(await result).toMatchObject({
			success: true,
			message: "Evaluación abierta.",
		});
		expect(calls[0]?.slice(0, 3)).toEqual([
			"open",
			COURSE_DOC,
			{ followUpDocumentId: "44444444-4444-4444-8444-444444444444" },
		]);
	});

	test("cierra la evaluación", async () => {
		const { result, calls } = run({ intent: "close-follow-up", payload });

		expect(await result).toMatchObject({
			success: true,
			message: "Evaluación cerrada.",
		});
		expect(calls[0]?.[0]).toBe("close");
	});

	test("un intent desconocido no llega al servicio", async () => {
		const { result, calls } = run({ intent: "otra-cosa", payload });

		expect(await result).toMatchObject({ success: false });
		expect(calls).toEqual([]);
	});
});
