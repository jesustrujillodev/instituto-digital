import { describe, expect, test } from "vitest";
import {
	COURSE_DOC,
	LESSON_1,
	MODULE_A,
	MODULE_B,
} from "../../../../domain/__tests__/content.fixtures";
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

const okReply = () => ({
	success: true,
	data: null,
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
			createModule: record("createModule"),
			updateModule: record("updateModule"),
			archiveModule: record("archiveModule"),
			createLesson: record("createLesson"),
			updateLesson: record("updateLesson"),
			archiveLesson: record("archiveLesson"),
			reorder: record("reorder"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], fields: Record<string, string>) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/cursos/${COURSE_DOC}/contenido`,
			{ method: "POST", body: new URLSearchParams(fields) },
		),
		context,
		params: { documentId: COURSE_DOC },
	} as unknown as ActionArgs);

describe("contenido action", () => {
	test("crear módulo pasa el curso y el dto al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, {
			intent: "create-module",
			payload: JSON.stringify({ title: "Fundamentos" }),
		});

		expect(result).toMatchObject({ success: true, message: "Módulo añadido." });
		expect(calls[0].method).toBe("createModule");
		expect(calls[0].args.slice(0, 2)).toEqual([
			COURSE_DOC,
			{ title: "Fundamentos", description: null },
		]);
	});

	test("crear devuelve el documentId de lo creado, para seleccionarlo", async () => {
		const { context } = createHarness({
			...okReply(),
			data: { documentId: "leccion-nueva" },
		});

		const result = await run(context, {
			intent: "create-lesson",
			payload: JSON.stringify({
				moduleDocumentId: MODULE_A,
				title: "Nueva",
				type: "TEXT",
			}),
		});

		expect(result).toMatchObject({
			success: true,
			data: { documentId: "leccion-nueva" },
		});
	});

	test("archivar un módulo viaja por su documentId", async () => {
		const { context, calls } = createHarness();

		await run(context, {
			intent: "archive-module",
			payload: JSON.stringify({ moduleDocumentId: MODULE_A }),
		});

		expect(calls[0].method).toBe("archiveModule");
		expect(calls[0].args.slice(0, 2)).toEqual([COURSE_DOC, MODULE_A]);
	});

	test("crear lección conserva el módulo destino", async () => {
		const { context, calls } = createHarness();

		await run(context, {
			intent: "create-lesson",
			payload: JSON.stringify({
				moduleDocumentId: MODULE_A,
				title: "Marco legal",
				type: "LINK",
			}),
		});

		expect(calls[0].method).toBe("createLesson");
		expect(calls[0].args[1]).toEqual({
			moduleDocumentId: MODULE_A,
			title: "Marco legal",
			type: "LINK",
			isRequired: true,
			estimatedMinutes: null,
		});
	});

	test("archivar una lección despacha a su método", async () => {
		const { context, calls } = createHarness();

		await run(context, {
			intent: "archive-lesson",
			payload: JSON.stringify({ lessonDocumentId: LESSON_1 }),
		});

		expect(calls[0].method).toBe("archiveLesson");
		expect(calls[0].args.slice(0, 2)).toEqual([COURSE_DOC, LESSON_1]);
	});

	test("reordenar manda el árbol completo", async () => {
		const { context, calls } = createHarness();

		const order = {
			modules: [MODULE_B, MODULE_A],
			lessons: [
				{ moduleDocumentId: MODULE_A, lessonDocumentIds: [LESSON_1] },
				{ moduleDocumentId: MODULE_B, lessonDocumentIds: [] },
			],
		};

		await run(context, {
			intent: "reorder",
			payload: JSON.stringify(order),
		});

		expect(calls[0].method).toBe("reorder");
		expect(calls[0].args[1]).toEqual(order);
	});

	test("un intent desconocido no llega al servicio", async () => {
		const { context, calls } = createHarness();

		expect(
			await run(context, { intent: "borrar-todo", payload: "{}" }),
		).toMatchObject({
			success: false,
			error: { code: "VALIDATION_ERROR" },
		});
		expect(calls).toEqual([]);
	});

	test("un payload que no es JSON se rechaza en la frontera", async () => {
		const { context, calls } = createHarness();

		expect(
			await run(context, { intent: "create-module", payload: "{" }),
		).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
		expect(calls).toEqual([]);
	});

	test("el fallo del servicio vuelve traducido y con su código", async () => {
		const { context } = createHarness({
			success: false,
			error: { code: "CONTENT_MODULE_NOT_EMPTY", message: "Module not empty" },
			timestamp: new Date().toISOString(),
		});

		const result = await run(context, {
			intent: "archive-module",
			payload: JSON.stringify({ moduleDocumentId: MODULE_A }),
		});

		expect(result).toMatchObject({
			success: false,
			error: {
				code: "CONTENT_MODULE_NOT_EMPTY",
				message:
					"Archiva primero sus lecciones: un módulo con lecciones activas no se archiva.",
			},
		});
	});
});
