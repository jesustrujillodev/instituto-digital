import { parentPort, workerData } from "node:worker_threads";
import { deflateSync } from "node:zlib";
import {
	decodePDFRawStream,
	degrees,
	EncryptedPDFError,
	PDFContext,
	PDFDict,
	PDFDocument,
	PDFName,
	type PDFPage,
	PDFRawStream,
} from "@cantoo/pdf-lib";
import type { SanitizedPdf } from "../domain/certificate.pdf";
import type { SanitizeOutcome, SanitizeRequest } from "./pdf-sanitize.protocol";

// ===============================================================
// Saneado del PDF de fondo, fuera del hilo que atiende peticiones (ADR 0029)
// ===============================================================
// Un worker nuevo por subida: el contador y la bandera no se comparten. Corre
// el fuente con Node en desarrollo y en pruebas, y `build/worker/pdf-sanitize.js`
// en producción; por eso solo importa paquetes y tipos, nada que necesite alias.

const request = workerData as SanitizeRequest;

let decoded = 0;
let exceeded = false;

/**
 * pdf-lib no acota lo que descomprime: todo filtro (Flate, LZW, RunLength y sus
 * cadenas) crece por `DecodeStream.ensureBuffer`, así que el presupuesto va ahí
 * y cubre la carga (`/ObjStm`, `/XRef`) y `embedPage` (`/Contents`). La sonda
 * lleva `/Filter`: sin él, `decodePDFRawStream` devuelve un flujo simple cuyos
 * prototipos no pasan por `DecodeStream`.
 */
const limitDecoding = () => {
	const probe = decodePDFRawStream(
		PDFRawStream.of(
			PDFDict.fromMapWithContext(
				new Map([[PDFName.of("Filter"), PDFName.of("FlateDecode")]]),
				PDFContext.create(),
			),
			deflateSync(new Uint8Array(1)),
		),
	);
	let proto = Object.getPrototypeOf(probe);
	while (proto && !Object.hasOwn(proto, "ensureBuffer")) {
		proto = Object.getPrototypeOf(proto);
	}
	if (!proto || proto === Object.prototype) {
		throw new Error("pdf-lib: DecodeStream.ensureBuffer no encontrado");
	}

	// Lo que lleva descomprimido cada flujo es lo más alto que ha pedido; la
	// capacidad del búfer no sirve, porque crece al doble y casi nunca se pasa.
	const highWater = new WeakMap<object, number>();
	const ensureBuffer = proto.ensureBuffer;
	proto.ensureBuffer = function (this: object, requested: number) {
		const previous = highWater.get(this) ?? 0;
		if (requested > previous) {
			highWater.set(this, requested);
			decoded += requested - previous;
			if (decoded > request.maxDecodedBytes) {
				exceeded = true;
				throw new Error("decoded_budget_exceeded");
			}
		}
		return ensureBuffer.call(this, requested);
	};
};

type Rejected = Extract<SanitizeOutcome, { rejected: unknown }>;

const reject = (rejected: Rejected["rejected"]): never => {
	throw { rejected } satisfies Rejected;
};

const isRejected = (error: unknown): error is Rejected =>
	typeof error === "object" && error !== null && "rejected" in error;

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
		return reject(
			error instanceof EncryptedPDFError ? "encrypted" : "unreadable",
		);
	}
};

/**
 * Sanear es RECONSTRUIR: la página original entra a un documento nuevo como un
 * XObject (`embedPage`), que solo arrastra su contenido y sus recursos.
 * `copyPages` no serviría: copia el diccionario de la página con sus
 * anotaciones (`/Annots`) y acciones (`/AA`).
 */
const rebuild = async (bytes: Uint8Array): Promise<SanitizedPdf> => {
	const source = await load(bytes);
	if (source.getPageCount() < 1) reject("unreadable");

	const page = source.getPage(0);
	const crop = page.getCropBox();
	const rotation = normalizedRotation(page);
	const sideways = rotation === 90 || rotation === 270;
	const widthPt = sideways ? crop.height : crop.width;
	const heightPt = sideways ? crop.width : crop.height;

	const { min, max } = request.pageSide;
	const inRange = (side: number) => side >= min && side <= max;
	if (!inRange(widthPt) || !inRange(heightPt)) reject("page_out_of_range");

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
 * La carga guarda como inválido el objeto cuyo flujo agotó el presupuesto y
 * sigue: el rechazo sale de la bandera, no de la excepción.
 */
const outcomeOf = async (): Promise<SanitizeOutcome> => {
	try {
		const ok = await rebuild(request.bytes);
		return exceeded ? { rejected: "too_large" } : { ok };
	} catch (error) {
		if (exceeded) return { rejected: "too_large" };
		return isRejected(error) ? error : { rejected: "unreadable" };
	}
};

limitDecoding();
parentPort?.postMessage(await outcomeOf());
