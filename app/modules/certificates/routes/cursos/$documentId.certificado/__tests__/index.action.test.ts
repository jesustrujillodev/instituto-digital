import { describe, expect, test } from "vitest";
import {
	authPayloadOf,
	COURSE_ID,
	failReply,
	okReply,
} from "@/modules/courses/routes/cursos/__tests__/route-harness";
import { CERTIFICATE_ERROR_CODES } from "../../../../domain/certificate.errors";
import { DEFAULT_CERTIFICATE_DESIGN } from "../../../../domain/design/design.presets";
import { LEGACY_DEFAULT_DESIGN_V1 } from "../../../../domain/design/design-v1.schema";
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
			uploadImage: record("uploadImage"),
			uploadBackground: record("uploadBackground"),
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
		["un diseño incompleto", JSON.stringify({ version: 2 })],
		// El gestor anterior se sigue leyendo, pero ya no se escribe.
		["un diseño v1", JSON.stringify(LEGACY_DEFAULT_DESIGN_V1)],
		[
			"un diseño sin QR",
			JSON.stringify({
				...DEFAULT_CERTIFICATE_DESIGN,
				elements: DEFAULT_CERTIFICATE_DESIGN.elements.filter(
					(e) => e.type !== "qr",
				),
			}),
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
		const design = { ...DEFAULT_CERTIFICATE_DESIGN, folioFormat: "SOP-{seq}" };

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

	test("subir una imagen pasa el archivo al servicio", async () => {
		const { context, calls } = createHarness(
			okReply({ ref: "/api/storage?key=x", widthPx: 10, heightPx: 10 }),
		);
		const file = new File([new Uint8Array([1, 2, 3])], "sello.png", {
			type: "image/png",
		});

		const result = await run(context, formOf({ intent: "upload-image", file }));

		expect(result).toMatchObject({
			success: true,
			data: { ref: "/api/storage?key=x" },
		});
		expect(calls[0].method).toBe("uploadImage");
		expect(calls[0].args[0]).toBe(COURSE_ID);
		expect((calls[0].args[1] as File).name).toBe("sello.png");
	});

	test("subir sin archivo no llega al servicio", async () => {
		const { context, calls } = createHarness();

		const result = await run(context, formOf({ intent: "upload-image" }));

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	test("subir un fondo pasa el PDF, el raster y su resolución", async () => {
		const { context, calls } = createHarness(okReply(null));
		const pdf = new File([new Uint8Array([1])], "fondo.pdf", {
			type: "application/pdf",
		});
		const raster = new File([new Uint8Array([2])], "fondo.webp", {
			type: "image/webp",
		});

		const result = await run(
			context,
			formOf({ intent: "upload-background", pdf, raster, rasterDpi: "300" }),
		);

		expect(result).toMatchObject({ success: true, message: "Fondo cargado." });
		expect(calls[0]).toMatchObject({
			method: "uploadBackground",
			args: [{ documentId: COURSE_ID, rasterDpi: 300 }, expect.anything()],
		});
	});

	test.each([
		["sin raster", { rasterDpi: "300" }],
		["sin resolución", { rasterDpi: "nada" }],
	])("un fondo %s no llega al servicio", async (_case, fields) => {
		const { context, calls } = createHarness();
		const pdf = new File([new Uint8Array([1])], "fondo.pdf", {
			type: "application/pdf",
		});

		const result = await run(
			context,
			formOf({ intent: "upload-background", pdf, ...fields }),
		);

		expect(!result.success && result.error.code).toBe("VALIDATION_ERROR");
		expect(calls).toEqual([]);
	});

	test("un fallo del servicio vuelve con su copia", async () => {
		const { context } = createHarness(
			failReply(CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED),
		);

		const result = await run(
			context,
			formOf({
				intent: "save-draft",
				payload: JSON.stringify(DEFAULT_CERTIFICATE_DESIGN),
			}),
		);

		expect(!result.success && result.error.message).toBe(
			"Una de las imágenes no se subió a esta capacitación. Vuelve a subirla.",
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
