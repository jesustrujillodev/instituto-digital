import { describe, expect, test } from "vitest";
import {
	type ActorOptions,
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../../../domain/certificate.config";
import { CERTIFICATE_ERROR_CODES } from "../../../../domain/certificate.errors";
import { loader } from "../index.loader";

type LoaderArgs = Parameters<typeof loader>[0];

const NOW = new Date("2026-09-23T18:00:00.000Z");

const editorOf = (status = "PUBLISHED") => ({
	course: {
		id: 7,
		documentId: COURSE_ID,
		status,
		title: "Seguridad en obra",
		description: null,
		dependencyName: "Obras Públicas",
		hours: 20,
	},
	record: {
		draft: DEFAULT_CERTIFICATE_DESIGN,
		published: null,
		publishedAt: null,
		exists: false,
	},
	state: "never-published",
});

const createHarness = (options: ActorOptions & { reply?: unknown } = {}) => {
	const calls: unknown[][] = [];
	const context = {
		authPayload: authPayloadOf(options),
		clock: { now: () => NOW },
		certificateService: {
			getEditor: async (...args: unknown[]) => {
				calls.push(args);
				return options.reply ?? okReply(editorOf());
			},
		},
	} as unknown as LoaderArgs["context"];

	return { context, calls };
};

const run = (context: LoaderArgs["context"], documentId = COURSE_ID) =>
	loader({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${documentId}/certificado`,
		),
		context,
		params: { documentId },
	} as unknown as LoaderArgs);

describe("certificado loader", () => {
	test("devuelve el editor, si se puede editar y la fecha del servidor", async () => {
		const { context, calls } = createHarness();

		const result = await run(context);

		expect(result).toMatchObject({
			success: true,
			data: { canEdit: true, today: NOW, editor: { state: "never-published" } },
		});
		expect(calls[0][0]).toBe(COURSE_ID);
	});

	test("un curso cancelado se abre de solo lectura", async () => {
		const { context } = createHarness({
			reply: okReply(editorOf("CANCELLED")),
		});

		expect(await run(context)).toMatchObject({ data: { canEdit: false } });
	});

	test("un participante sin perfil de capacitador recibe 403", async () => {
		const { context, calls } = createHarness({ role: "USER" });

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(403);
		expect(calls).toEqual([]);
	});

	test("un curso fuera de alcance responde 404, igual que inexistente", async () => {
		const { context } = createHarness({
			reply: failReply(CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND),
		});

		const thrown = await run(context).catch((error) => error);

		expect(thrown.init.status).toBe(404);
	});
});
