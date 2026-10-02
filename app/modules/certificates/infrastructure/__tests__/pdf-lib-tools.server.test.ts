import { degrees, PDFDocument, PDFName, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, test } from "vitest";
import { CERTIFICATE_ERROR_CODES } from "../../domain/certificate.errors";
import { createPdfLibTools } from "../pdf-lib-tools.server";

const tools = createPdfLibTools();

const pdfOf = async (
	build: (document: PDFDocument) => Promise<void> | void,
): Promise<Uint8Array> => {
	const document = await PDFDocument.create();
	await build(document);
	return document.save();
};

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("sanitize", () => {
	test("reconstruye la primera página con su tamaño", async () => {
		const bytes = await pdfOf(async (document) => {
			const page = document.addPage([841.89, 595.28]);
			page.drawText("FONDO", {
				font: await document.embedFont(StandardFonts.Helvetica),
			});
			document.addPage([400, 400]);
		});

		const clean = await tools.sanitize(bytes);

		expect(clean.widthPt).toBeCloseTo(841.89, 2);
		expect(clean.heightPt).toBeCloseTo(595.28, 2);
		const reloaded = await PDFDocument.load(clean.bytes);
		expect(reloaded.getPageCount()).toBe(1);
	});

	test("no arrastra JavaScript, acciones ni anotaciones", async () => {
		const bytes = await pdfOf((document) => {
			const page = document.addPage([600, 400]);
			document.addJavaScript("alerta", "app.alert('x')");
			page.node.set(
				PDFName.of("AA"),
				document.context.obj({ O: { S: "JavaScript", JS: "app.alert(1)" } }),
			);
			page.node.set(PDFName.of("Annots"), document.context.obj([]));
		});

		const clean = latin1((await tools.sanitize(bytes)).bytes);

		expect(clean).not.toMatch(/JavaScript|\/JS|\/AA|\/Annots/);
	});

	test("aplica la rotación y el recorte de la página", async () => {
		const bytes = await pdfOf((document) => {
			const page = document.addPage([400, 700]);
			page.setRotation(degrees(90));
			page.setCropBox(0, 0, 400, 600);
		});

		const clean = await tools.sanitize(bytes);

		expect(clean.widthPt).toBe(600);
		expect(clean.heightPt).toBe(400);
	});

	test.each([180, 270])(
		"una página girada %i grados se reconstruye",
		async (angle) => {
			const bytes = await pdfOf((document) => {
				document.addPage([500, 300]).setRotation(degrees(angle));
			});

			const clean = await tools.sanitize(bytes);

			expect(
				angle === 270
					? [clean.widthPt, clean.heightPt]
					: [clean.widthPt, clean.heightPt],
			).toEqual(angle === 270 ? [300, 500] : [500, 300]);
		},
	);

	test.each([
		["algo que no es un PDF", new TextEncoder().encode("<svg/>"), "not_pdf"],
		["un PDF roto", new TextEncoder().encode("%PDF-1.7 basura"), "unreadable"],
	])("rechaza %s", async (_case, bytes, reason) => {
		await expect(tools.sanitize(bytes)).rejects.toMatchObject({
			code: CERTIFICATE_ERROR_CODES.BACKGROUND_INVALID,
			details: { reason },
		});
	});

	test("rechaza un PDF cifrado", async () => {
		const document = await PDFDocument.create();
		document.addPage([600, 400]);
		document.encrypt({ userPassword: "secreta", ownerPassword: "dueña" });
		const bytes = await document.save();

		await expect(tools.sanitize(bytes)).rejects.toMatchObject({
			details: { reason: "encrypted" },
		});
	});

	test.each([[[100, 400]], [[600, 1500]]])(
		"rechaza una página fuera de A7–A3 (%o)",
		async (size) => {
			const bytes = await pdfOf((document) => {
				document.addPage(size as [number, number]);
			});

			await expect(tools.sanitize(bytes)).rejects.toMatchObject({
				details: { reason: "page_out_of_range" },
			});
		},
	);
});

describe("overlay", () => {
	test("estampa la capa arriba a la izquierda, sin cambiar el tamaño del fondo", async () => {
		const base = await pdfOf((document) => {
			document.addPage([841.89, 595.28]);
		});
		const layer = await pdfOf(async (document) => {
			const page = document.addPage([841.92, 594.96]);
			page.drawText("CAPA", {
				font: await document.embedFont(StandardFonts.Helvetica),
			});
		});

		const composed = await PDFDocument.load(await tools.overlay(base, layer));

		expect(composed.getPageCount()).toBe(1);
		expect(composed.getPage(0).getSize()).toEqual({
			width: 841.89,
			height: 595.28,
		});
	});
});
