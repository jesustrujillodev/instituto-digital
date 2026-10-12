import { Worker } from "node:worker_threads";
import { PDFDocument } from "@cantoo/pdf-lib";
import { CertificateBackgroundInvalidError } from "../domain/certificate.errors";
import type { ICertificatePdfTools } from "../domain/certificate.pdf";
import { looksLikePdf } from "../domain/certificate-assets.rules";
import { PAGE_SIDE_PT } from "../domain/design/design-v2.config";
import type { SanitizeOutcome, SanitizeRequest } from "./pdf-sanitize.protocol";

/** Cuánto puede descomprimir un fondo de 10 MB, entre todos sus flujos. */
const MAX_DECODED_BYTES = 32 * 1024 * 1024;
/** Un fondo legítimo se sanea en menos de un segundo. */
const SANITIZE_TIMEOUT_MS = 10_000;
const WORKER_HEAP_MB = 256;
/** Saneados a la vez: cada uno con su heap, el resto espera turno. */
const MAX_CONCURRENT_SANITIZES = 2;

type PdfLibToolsOptions = {
	/** El worker de saneado: el fuente en desarrollo, el build en producción. */
	sanitizeWorker: URL;
	timeoutMs?: number;
};

/** Cola mínima: como mucho `limit` trabajos a la vez. */
const createGate = (limit: number) => {
	let running = 0;
	const waiting: (() => void)[] = [];
	return async <T>(work: () => Promise<T>): Promise<T> => {
		if (running >= limit) {
			await new Promise<void>((resolve) => waiting.push(resolve));
		}
		running += 1;
		try {
			return await work();
		} finally {
			running -= 1;
			waiting.shift()?.();
		}
	};
};

const isOutOfMemory = (error: unknown) =>
	(error as { code?: string })?.code === "ERR_WORKER_OUT_OF_MEMORY";

/**
 * Lanza el worker y espera su respuesta. Plazo vencido o heap agotado son un
 * PDF demasiado grande; cualquier otro fallo del worker (por ejemplo, que no
 * esté en el build) es un error de despliegue y se propaga tal cual.
 */
const runWorker = (
	sanitizeWorker: URL,
	timeoutMs: number,
	bytes: Uint8Array,
): Promise<SanitizeOutcome> =>
	new Promise((resolve, reject) => {
		const worker = new Worker(sanitizeWorker, {
			workerData: {
				bytes,
				pageSide: { min: PAGE_SIDE_PT.min, max: PAGE_SIDE_PT.max },
				maxDecodedBytes: MAX_DECODED_BYTES,
			} satisfies SanitizeRequest,
			resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
		});
		let settled = false;
		const settle = (finish: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			void worker.terminate();
			finish();
		};
		const timer = setTimeout(
			() => settle(() => resolve({ rejected: "too_large" })),
			timeoutMs,
		);

		worker.once("message", (outcome: SanitizeOutcome) =>
			settle(() => resolve(outcome)),
		);
		worker.once("error", (error) =>
			settle(() =>
				isOutOfMemory(error)
					? resolve({ rejected: "too_large" })
					: reject(error),
			),
		);
		worker.once("exit", (code) =>
			settle(() =>
				reject(
					new Error(`pdf-sanitize: el worker salió sin respuesta (${code})`),
				),
			),
		);
	});

/**
 * PDF del fondo con pdf-lib (ADR 0029).
 *
 * El saneado reconstruye la página en un documento nuevo
 * (`pdf-sanitize.worker.server.ts`) y corre en un worker, con presupuesto de
 * descompresión, plazo y heap propios: un PDF de unos KB que se infla a
 * decenas de MB no bloquea el proceso que atiende a los demás.
 */
export const createPdfLibTools = ({
	sanitizeWorker,
	timeoutMs = SANITIZE_TIMEOUT_MS,
}: PdfLibToolsOptions): ICertificatePdfTools => {
	const gate = createGate(MAX_CONCURRENT_SANITIZES);

	return {
		async sanitize(bytes) {
			if (!looksLikePdf(bytes)) {
				throw new CertificateBackgroundInvalidError("not_pdf");
			}
			const outcome = await gate(() =>
				runWorker(sanitizeWorker, timeoutMs, bytes),
			);
			if ("rejected" in outcome) {
				throw new CertificateBackgroundInvalidError(outcome.rejected);
			}
			return outcome.ok;
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
	};
};
