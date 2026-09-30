import { describe, expect, test } from "vitest";
import {
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../../../domain/certificate.config";
import { CERTIFICATE_ERROR_CODES } from "../../../../domain/certificate.errors";
import { action } from "../index.action";

type ActionArgs = Parameters<typeof action>[0];

const createHarness = (reply: unknown = okReply(null)) => {
	const calls: { method: string; args: unknown[] }[] = [];
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			calls.push({ method, args });
			return reply;
		};

	const context = {
		authPayload: authPayloadOf(),
		certificateService: {
			saveDraft: record("saveDraft"),
			publish: record("publish"),
			discardDraft: record("discardDraft"),
			uploadSignature: record("uploadSignature"),
			saveDelivery: record("saveDelivery"),
		},
	} as unknown as ActionArgs["context"];

	return { context, calls };
};

const run = (context: ActionArgs["context"], body: FormData) =>
	action({
		request: new Request(
			`https://app.example.com/dashboard/capacitaciones/${COURSE_ID}/certificado`,
			{ method: "POST", body },
		),
		context,
		params: { documentId: COURSE_ID },
	} as unknown as ActionArgs);

const formOf = (fields: Record<string, string | File>) => {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return form;
};

describe("certificado action", () => {
	test("guardar pasa el diseño validado al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			context,
			formOf({
				intent: "save-draft",
				payload: JSON.stringify(DEFAULT_CERTIFICATE_DESIGN),
			}),
		);

		expect(result).toMatchObject({
			success: true,
			message: "Borrador guardado. Publícalo para que se emita con él.",
		});
		expect(calls[0]).toMatchObject({
			method: "saveDraft",
			args: [
				{ documentId: COURSE_ID, design: DEFAULT_CERTIFICATE_DESIGN },
				expect.anything(),
			],
		});
	});

	test.each([
		["un JSON roto", "{no es json"],
		["un diseño incompleto", JSON.stringify({ templateId: "marco" })],
		[
			"un acento que no es #rrggbb",
			JSON.stringify({ ...DEFAULT_CERTIFICATE_DESIGN, accentColor: "red" }),
		],
	])("%s no llega al servicio", async (_case, payload) => {
		const { context, calls } = createHarness();

		const result = await run(
			context,
			formOf({ intent: "save-draft", payload }),
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	// Publicar lleva lo que está en pantalla: guardar primero ya no es un paso
	// que se pueda olvidar (docs/adr/0023).
	test("publicar pasa al servicio el diseño del cuerpo", async () => {
		const { context, calls } = createHarness();
		const design = { ...DEFAULT_CERTIFICATE_DESIGN, subtitle: "X" };

		const result = await run(
			context,
			formOf({ intent: "publish", payload: JSON.stringify(design) }),
		);

		expect(result).toMatchObject({
			success: true,
			message: "Certificado publicado. Se emitirá con este diseño.",
		});
		expect(calls).toEqual([
			{
				method: "publish",
				args: [{ documentId: COURSE_ID, design }, expect.anything()],
			},
		]);
	});

	test("publicar un diseño inválido no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			context,
			formOf({ intent: "publish", payload: "{}" }),
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	test("subir una firma pasa el archivo al servicio", async () => {
		const { context, calls } = createHarness(
			okReply({ signatureUrl: "/api/storage?key=x" }),
		);
		const file = new File([new Uint8Array([1, 2, 3])], "firma.png", {
			type: "image/png",
		});

		const result = await run(
			context,
			formOf({ intent: "upload-signature", file }),
		);

		expect(result).toMatchObject({
			success: true,
			data: { signatureUrl: "/api/storage?key=x" },
		});
		expect(calls[0].method).toBe("uploadSignature");
		expect((calls[0].args[1] as File).name).toBe("firma.png");
	});

	test("subir sin archivo no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, formOf({ intent: "upload-signature" }));

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	test("un fallo del servicio vuelve con su copia", async () => {
		const { context } = createHarness(
			failReply(CERTIFICATE_ERROR_CODES.SIGNATURE_NOT_OWNED),
		);

		const result = await run(
			context,
			formOf({
				intent: "save-draft",
				payload: JSON.stringify(DEFAULT_CERTIFICATE_DESIGN),
			}),
		);

		expect(!result.success && result.error.message).toBe(
			"Una de las firmas no se subió a esta capacitación. Vuelve a subirla.",
		);
	});

	test("guardar la entrega toma el curso de la URL, no del cuerpo", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			context,
			formOf({
				intent: "save-delivery",
				payload: JSON.stringify({
					isDownloadable: false,
					emailMessage: "¡Felicidades!",
					documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				}),
			}),
		);

		expect(result).toMatchObject({
			success: true,
			message: "Entrega guardada.",
		});
		expect(calls[0]).toMatchObject({
			method: "saveDelivery",
			args: [
				{
					documentId: COURSE_ID,
					isDownloadable: false,
					emailMessage: "¡Felicidades!",
				},
				expect.anything(),
			],
		});
	});

	test("una entrega con un mensaje demasiado largo no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(
			context,
			formOf({
				intent: "save-delivery",
				payload: JSON.stringify({
					isDownloadable: true,
					emailMessage: "x".repeat(501),
				}),
			}),
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	test("una intención desconocida se rechaza", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, formOf({ intent: "borrar-todo" }));

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});
});
