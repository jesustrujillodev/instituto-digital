import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	LESSON_1,
} from "../../../../domain/__tests__/content.fixtures";
import { CONTENT_ERROR_CODES } from "../../../../domain/content.errors";
import { action } from "../index.action";
import { loader } from "../index.loader";

type ActionArgs = Parameters<typeof action>[0];
type LoaderArgs = Parameters<typeof loader>[0];

const FOLLOW_UP = "44444444-4444-4444-8444-444444444444";
const Q1 = "11111111-1111-4111-8111-111111111111";
const OPTION = "01000000-0000-4000-8000-000000000000";

const authPayload = {
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 50,
	email: "ana@instituto.gob.mx",
	role: "USER",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
};

const contextOf = (calls: unknown[][], success = true) =>
	({
		authPayload,
		quizService: {
			submit: async (...args: unknown[]) => {
				calls.push(args);
				return success
					? {
							success: true,
							data: { score: 100, passed: true, passingScore: 60 },
							timestamp: new Date().toISOString(),
						}
					: {
							success: false,
							error: {
								code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_ATTENDED,
								message: "Attendance to the session is required",
							},
							timestamp: new Date().toISOString(),
						};
			},
			findView: async (...args: unknown[]) => {
				calls.push(args);
				return {
					success: true,
					data: null,
					timestamp: new Date().toISOString(),
				};
			},
		},
	}) as unknown;

const submit = (payload: object, success = true) => {
	const calls: unknown[][] = [];
	const result = action({
		request: new Request(
			`https://app.example.com/dashboard/mis-capacitaciones/${COURSE_DOC}/seguimiento/${FOLLOW_UP}`,
			{
				method: "POST",
				body: new URLSearchParams({ payload: JSON.stringify(payload) }),
			},
		),
		context: contextOf(calls, success),
		params: { documentId: COURSE_DOC, followUpDocumentId: FOLLOW_UP },
	} as unknown as ActionArgs);
	return { result, calls };
};

const answers = [{ questionDocumentId: Q1, optionDocumentId: OPTION }];

describe("mis-capacitaciones: presentar una evaluación de seguimiento", () => {
	// La evaluación sale de la URL: aunque el cuerpo nombre otra cosa, se ignora.
	test("el dueño no lo decide el cliente", async () => {
		const { result, calls } = submit({
			lessonDocumentId: LESSON_1,
			followUpDocumentId: COURSE_DOC,
			answers,
		});

		expect(await result).toMatchObject({
			success: true,
			message: "Aprobaste con 100.",
		});
		expect(calls[0]?.slice(0, 2)).toEqual([
			COURSE_DOC,
			{
				lessonDocumentId: null,
				moduleDocumentId: null,
				followUpDocumentId: FOLLOW_UP,
				answers,
			},
		]);
	});

	test("el rechazo del servicio llega localizado", async () => {
		const { result } = submit({ answers }, false);

		expect(await result).toMatchObject({
			success: false,
			error: {
				code: CONTENT_ERROR_CODES.FOLLOW_UP_NOT_ATTENDED,
				message:
					"Para presentar esta evaluación tienes que registrar tu asistencia a la sesión.",
			},
		});
	});

	test("el loader pide la vista con el dueño de la URL", async () => {
		const calls: unknown[][] = [];

		const result = await loader({
			request: new Request(
				`https://app.example.com/dashboard/mis-capacitaciones/${COURSE_DOC}/seguimiento/${FOLLOW_UP}`,
			),
			context: contextOf(calls),
			params: { documentId: COURSE_DOC, followUpDocumentId: FOLLOW_UP },
		} as unknown as LoaderArgs);

		expect(result.data).toEqual({ courseDocumentId: COURSE_DOC, view: null });
		expect(calls[0]?.slice(0, 2)).toEqual([
			COURSE_DOC,
			{
				lessonDocumentId: null,
				moduleDocumentId: null,
				followUpDocumentId: FOLLOW_UP,
			},
		]);
	});
});
