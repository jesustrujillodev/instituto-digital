import { deflateSync } from "node:zlib";
import {
	degrees,
	PDFDocument,
	PDFName,
	PDFRawStream,
	StandardFonts,
} from "@cantoo/pdf-lib";
import { describe, expect, test } from "vitest";
import { CERTIFICATE_ERROR_CODES } from "../../domain/certificate.errors";
import { createPdfLibTools } from "../pdf-lib-tools.server";

// El saneado corre en un worker: en pruebas, el fuente; en producción, el build.
const SANITIZE_WORKER = new URL(
	"../pdf-sanitize.worker.server.ts",
	import.meta.url,
);

const tools = createPdfLibTools({ sanitizeWorker: SANITIZE_WORKER });

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

const MiB = 1024 * 1024;

/**
 * Unos cientos de bytes que, descomprimidos, pasan de largo el presupuesto.
 * Escrito a mano: al guardar, pdf-lib descarta los `/ObjStm` del contexto.
 */
const objectStreamBomb = () => {
	const contents = deflateSync(
		deflateSync(
			Buffer.concat([Buffer.from("904 0 <<>>"), Buffer.alloc(48 * MiB, 0x20)]),
		),
	);
	return new Uint8Array(
		Buffer.concat([
			Buffer.from(
				[
					"%PDF-1.7",
					"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
					"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
					"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] >> endobj",
					`4 0 obj << /Type /ObjStm /N 1 /First 6 /Length ${contents.length} /Filter [/FlateDecode /FlateDecode] >> stream`,
					"",
				].join("\n"),
				"latin1",
			),
			contents,
			Buffer.from(
				"\nendstream endobj\ntrailer << /Root 1 0 R /Size 5 >>\n%%EOF\n",
				"latin1",
			),
		]),
	);
};

/** La misma referencia ocho veces en `/Contents`: 8 × 6 MiB al copiar la página. */
const contentsBomb = () =>
	pdfOf((document) => {
		const page = document.addPage([792, 612]);
		const contents = deflateSync(Buffer.alloc(6 * MiB, 0x20));
		const ref = document.context.register(
			PDFRawStream.of(
				document.context.obj({
					Filter: "FlateDecode",
					Length: contents.length,
				}),
				contents,
			),
		);
		page.node.set(
			PDFName.of("Contents"),
			document.context.obj(Array.from({ length: 8 }, () => ref)),
		);
	});

/** Cuánto tarda `work` y el mayor hueco entre ticks de un temporizador de 5 ms. */
const measureEventLoop = async (work: () => Promise<unknown>) => {
	let last = performance.now();
	let maxGapMs = 0;
	const timer = setInterval(() => {
		const now = performance.now();
		maxGapMs = Math.max(maxGapMs, now - last);
		last = now;
	}, 5);
	const started = performance.now();
	const outcome = await work().then(
		() => null,
		(error: unknown) => error,
	);
	const elapsedMs = performance.now() - started;
	clearInterval(timer);
	return {
		outcome,
		elapsedMs,
		maxGapMs: Math.max(maxGapMs, performance.now() - last),
	};
};

// C02 y C03: un PDF de unos KB bloqueaba segundos el único proceso web.
describe("sanitize con presupuesto de descompresión", () => {
	test.each([
		["un /ObjStm con Flate encadenado", objectStreamBomb],
		["un /Contents que se descomprime al copiar la página", contentsBomb],
	])(
		"%s se rechaza como too_large sin bloquear el event loop",
		async (_case, build) => {
			const bytes = await build();

			const { outcome, elapsedMs, maxGapMs } = await measureEventLoop(() =>
				tools.sanitize(bytes),
			);

			expect(outcome).toMatchObject({
				code: CERTIFICATE_ERROR_CODES.BACKGROUND_INVALID,
				details: { reason: "too_large" },
			});
			expect(elapsedMs).toBeLessThan(3000);
			expect(maxGapMs).toBeLessThan(150);
		},
		30_000,
	);

	test("un fondo legítimo tampoco bloquea el event loop", async () => {
		const bytes = await pdfOf(async (document) => {
			const page = document.addPage([841.89, 595.28]);
			page.drawText("FONDO", {
				font: await document.embedFont(StandardFonts.Helvetica),
			});
		});

		const { outcome, maxGapMs } = await measureEventLoop(() =>
			tools.sanitize(bytes),
		);

		expect(outcome).toBeNull();
		expect(maxGapMs).toBeLessThan(150);
	});

	test("con el plazo vencido se rechaza como too_large", async () => {
		const bytes = await pdfOf((document) => {
			document.addPage([600, 400]);
		});

		await expect(
			createPdfLibTools({
				sanitizeWorker: SANITIZE_WORKER,
				timeoutMs: 1,
			}).sanitize(bytes),
		).rejects.toMatchObject({ details: { reason: "too_large" } });
	});

	// Un despliegue sin el worker es un error de quien opera, no un PDF malo.
	test("sin el archivo del worker falla como error inesperado", async () => {
		const bytes = await pdfOf((document) => {
			document.addPage([600, 400]);
		});

		const error = await createPdfLibTools({
			sanitizeWorker: new URL("../no-existe.worker.ts", import.meta.url),
		})
			.sanitize(bytes)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(error).not.toHaveProperty(
			"code",
			CERTIFICATE_ERROR_CODES.BACKGROUND_INVALID,
		);
	});
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
