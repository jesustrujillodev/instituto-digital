import {
	degrees,
	EncryptedPDFError,
	PDFDocument,
	type PDFPage,
} from "@cantoo/pdf-lib";
import { CertificateBackgroundInvalidError } from "../domain/certificate.errors";
import type {
	ICertificatePdfTools,
	SanitizedPdf,
} from "../domain/certificate.pdf";
import { looksLikePdf } from "../domain/certificate-assets.rules";
import { PAGE_SIDE_PT } from "../domain/design/design-v2.config";

const normalizedRotation = (page: PDFPage) =>
	(((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;

/**
 * Cómo dibujar la página original en una nueva sin rotación, para que se vea
 * igual que con su `/Rotate` (lo mismo que hace pdf.js al rasterizar).
 */
const placementOf = (rotation: number, width: number, height: number) => {
	switch (rotation) {
		case 90:
			return { x: 0, y: height, rotate: degrees(-90) };
		case 180:
			return { x: width, y: height, rotate: degrees(180) };
		case 270:
			return { x: width, y: 0, rotate: degrees(90) };
		default:
			return { x: 0, y: 0 };
	}
};

const load = async (bytes: Uint8Array) => {
	try {
		return await PDFDocument.load(bytes, {
			ignoreEncryption: false,
			updateMetadata: false,
		});
	} catch (error) {
		throw new CertificateBackgroundInvalidError(
			error instanceof EncryptedPDFError ? "encrypted" : "unreadable",
		);
	}
};

/** Lo que se rechaza viaja con su motivo; cualquier otro fallo es un PDF ilegible. */
const asRejection = (error: unknown) =>
	error instanceof CertificateBackgroundInvalidError
		? error
		: new CertificateBackgroundInvalidError("unreadable");

const rebuild = async (bytes: Uint8Array): Promise<SanitizedPdf> => {
	const source = await load(bytes);
	if (source.getPageCount() < 1) {
		throw new CertificateBackgroundInvalidError("unreadable");
	}

	const page = source.getPage(0);
	const crop = page.getCropBox();
	const rotation = normalizedRotation(page);
	const sideways = rotation === 90 || rotation === 270;
	const widthPt = sideways ? crop.height : crop.width;
	const heightPt = sideways ? crop.width : crop.height;

	const inRange = (side: number) =>
		side >= PAGE_SIDE_PT.min && side <= PAGE_SIDE_PT.max;
	if (!inRange(widthPt) || !inRange(heightPt)) {
		throw new CertificateBackgroundInvalidError("page_out_of_range");
	}

	const clean = await PDFDocument.create();
	const target = clean.addPage([widthPt, heightPt]);
	// Una página sin contenido es un fondo en blanco: no hay nada que copiar.
	if (page.node.Contents()) {
		const embedded = await clean.embedPage(page, {
			left: crop.x,
			bottom: crop.y,
			right: crop.x + crop.width,
			top: crop.y + crop.height,
		});
		target.drawPage(embedded, {
			...placementOf(rotation, widthPt, heightPt),
			width: crop.width,
			height: crop.height,
		});
	}
	return { bytes: await clean.save(), widthPt, heightPt };
};

/**
 * PDF del fondo con pdf-lib (ADR 0029).
 *
 * Sanear es RECONSTRUIR: la página original entra a un documento nuevo como
 * un XObject (`embedPage`), que solo arrastra su contenido y sus recursos.
 * `copyPages` no serviría: copia el diccionario de la página con sus
 * anotaciones (`/Annots`) y acciones (`/AA`).
 */
export const createPdfLibTools = (): ICertificatePdfTools => ({
	async sanitize(bytes) {
		if (!looksLikePdf(bytes)) {
			throw new CertificateBackgroundInvalidError("not_pdf");
		}
		try {
			return await rebuild(bytes);
		} catch (error) {
			throw asRejection(error);
		}
	},

	/**
	 * Chromium redondea el tamaño de página a su rejilla interna (unas
	 * centésimas de punto), así que la capa se ancla arriba a la izquierda a su
	 * tamaño natural en vez de estirarla: los elementos se colocan desde arriba.
	 */
	async overlay(base, layer) {
		const document = await PDFDocument.load(base);
		const [embedded] = await document.embedPdf(layer, [0]);
		const page = document.getPage(0);
		page.drawPage(embedded, {
			x: 0,
			y: page.getHeight() - embedded.height,
			width: embedded.width,
			height: embedded.height,
		});
		return new Uint8Array(await document.save());
	},
});
