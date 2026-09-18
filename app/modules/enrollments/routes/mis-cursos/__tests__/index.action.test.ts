import { describe, expect, test } from "vitest";
import {
	authPayloadOf,
	COURSE_ID,
	okReply,
	postRequest,
} from "../../__tests__/route-harness";
import { action } from "../index.action";
import { loader } from "../index.loader";

type ActionArgs = Parameters<typeof action>[0];
type LoaderArgs = Parameters<typeof loader>[0];

const contextOf = (calls: { method: string; courseId: unknown }[]) =>
	({
		authPayload: authPayloadOf(),
		enrollmentService: {
			accept: async (courseId: unknown) => {
				calls.push({ method: "accept", courseId });
				return okReply(null);
			},
			decline: async (courseId: unknown) => {
				calls.push({ method: "decline", courseId });
				return okReply(null);
			},
			listMine: async () =>
				okReply({
					invitations: [],
					upcoming: [],
					inProgress: [],
					finished: [],
				}),
		},
	}) as unknown as ActionArgs["context"];

describe("mis-cursos action", () => {
	test.each(["accept", "decline"])(
		"%s usa el curso enviado en el formulario",
		async (intent) => {
			const calls: { method: string; courseId: unknown }[] = [];

			const result = await action({
				request: postRequest("/dashboard/mis-cursos", {
					intent,
					courseDocumentId: COURSE_ID,
				}),
				context: contextOf(calls),
				params: {},
			} as unknown as ActionArgs);

			expect(result.success).toBe(true);
			expect(calls).toEqual([{ method: intent, courseId: COURSE_ID }]);
		},
	);

	test("sin curso falla en la validación", async () => {
		const calls: { method: string; courseId: unknown }[] = [];

		const result = await action({
			request: postRequest("/dashboard/mis-cursos", { intent: "accept" }),
			context: contextOf(calls),
			params: {},
		} as unknown as ActionArgs);

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});
});

describe("mis-cursos loader", () => {
	test("un participante recibe sus cuatro listas", async () => {
		const { data } = await loader({
			request: new Request("https://app.example.com/dashboard/mis-cursos"),
			context: contextOf([]) as unknown as LoaderArgs["context"],
			params: {},
		} as unknown as LoaderArgs);

		expect(Object.keys(data)).toEqual([
			"invitations",
			"upcoming",
			"inProgress",
			"finished",
			"view",
		]);
	});

	test("pinta la disposición guardada en su cookie", async () => {
		const { data } = await loader({
			request: new Request("https://app.example.com/dashboard/mis-cursos", {
				headers: { Cookie: "vista_mis_cursos=list" },
			}),
			context: contextOf([]) as unknown as LoaderArgs["context"],
			params: {},
		} as unknown as LoaderArgs);

		expect(data.view).toBe("list");
	});
});
