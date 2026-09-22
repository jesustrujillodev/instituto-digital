import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	LESSON_1,
} from "../../../../domain/__tests__/content.fixtures";
import { LESSON_MATERIAL_PREFIX } from "../../../../domain/content.config";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const authPayloadOf = () => ({
	sub: "99999999-9999-4999-8999-999999999999",
	userId: 9,
	email: "titular@instituto.gob.mx",
	role: "DEPENDENCY_HEAD",
	dependencyId: 3,
	isTrainer: false,
	iat: 1_800_000_000,
});

const okReply = (data: unknown = null) => ({
	success: true,
	data,
	timestamp: new Date().toISOString(),
});

const createHarness = (reply: unknown = okReply()) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return reply;
		};

	const context = {
		authPayload: authPayloadOf(),
		contentService: {
			createUploadUrl: record("createUploadUrl"),
			saveMaterial: record("saveMaterial"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${COURSE_DOC}/contenido/${LESSON_1}`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC, lessonDocumentId: LESSON_1 },
	} as unknown as ActionArgs);

describe("material action", () => {
	test("pedir permiso de subida devuelve el ticket sin envolverlo de nuevo", async () => {
		const ticket = {
			key: `${LESSON_MATERIAL_PREFIX}/clase-1700000000.mp4`,
			uploadUrl: "https://bucket.example/clase?signature=upload",
			expiresInSeconds: 900,
		};
		const { context, calls } = createHarness(okReply(ticket));

		const result = await run(context, {
			intent: "upload-url",
			payload: JSON.stringify({
				lessonDocumentId: LESSON_1,
				kind: "VIDEO",
				fileName: "clase.mp4",
				contentType: "video/mp4",
				size: 5_000_000,
			}),
		});

		expect(result).toMatchObject({ success: true, data: ticket });
		expect(calls[0].method).toBe("createUploadUrl");
		expect(calls[0].args[0]).toBe(COURSE_DOC);
	});

	test("guardar el material pasa el dto tal cual y confirma", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "save-material",
			payload: JSON.stringify({
				lessonDocumentId: LESSON_1,
				type: "LINK",
				externalUrl: "https://gob.mx/manual",
			}),
		});

		expect(result).toMatchObject({
			success: true,
			message: "Material guardado.",
		});
		expect(calls[0].method).toBe("saveMaterial");
		expect(calls[0].args[1]).toMatchObject({
			type: "LINK",
			externalUrl: "https://gob.mx/manual",
		});
	});

	test("un payload inválido no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "save-material",
			payload: JSON.stringify({
				lessonDocumentId: LESSON_1,
				type: "LINK",
				externalUrl: "javascript:alert(1)",
			}),
		});

		expect(result).toMatchObject({ success: false });
		expect(calls).toHaveLength(0);
	});

	test("un intent que no existe se rechaza sin tocar el servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, { intent: "borrar-todo", payload: "{}" });

		expect(result).toMatchObject({
			success: false,
			error: { message: "Acción no reconocida." },
		});
		expect(calls).toHaveLength(0);
	});
});
