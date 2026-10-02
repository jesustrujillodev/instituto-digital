import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useState } from "react";
import { rasterDpiFor } from "../domain/certificate-assets.rules";

export interface RasterizedPdf {
	pdf: File;
	raster: File;
	rasterDpi: number;
	widthPt: number;
	heightPt: number;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * La primera página del PDF rasterizada en el navegador, para la vista previa
 * del lienzo y el PNG. pdf.js se carga solo al elegir un archivo: pesa y nadie
 * lo necesita hasta entonces.
 *
 * El tamaño sale del `viewport` de pdf.js, que ya aplica el recorte y la
 * rotación de la página, igual que la reconstrucción del servidor; el servidor
 * comprueba que el raster corresponda.
 */
export function usePdfBackground() {
	const [pending, setPending] = useState(false);

	const rasterize = useCallback(async (pdf: File): Promise<RasterizedPdf> => {
		setPending(true);
		try {
			const pdfjs = await import("pdfjs-dist");
			pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

			const task = pdfjs.getDocument({
				data: new Uint8Array(await pdf.arrayBuffer()),
			});
			const document = await task.promise;
			try {
				const page = await document.getPage(1);
				const base = page.getViewport({ scale: 1 });
				const rasterDpi = rasterDpiFor(base.width, base.height);
				const viewport = page.getViewport({ scale: rasterDpi / 72 });

				const canvas = window.document.createElement("canvas");
				canvas.width = Math.round(viewport.width);
				canvas.height = Math.round(viewport.height);
				const context = canvas.getContext("2d");
				if (!context) throw new Error("canvas sin contexto 2d");

				context.fillStyle = "#ffffff";
				context.fillRect(0, 0, canvas.width, canvas.height);
				await page.render({ canvas, canvasContext: context, viewport }).promise;

				// Safari no codifica WEBP: devuelve PNG sin avisar. JPEG pesa menos
				// que ese PNG y el fondo es opaco.
				let blob = await toBlob(canvas, "image/webp", 0.92);
				if (blob?.type !== "image/webp") {
					blob = await toBlob(canvas, "image/jpeg", 0.9);
				}
				if (!blob) throw new Error("no se pudo codificar el raster");

				const extension = blob.type === "image/webp" ? "webp" : "jpg";
				return {
					pdf,
					raster: new File([blob], `fondo.${extension}`, { type: blob.type }),
					rasterDpi,
					widthPt: base.width,
					heightPt: base.height,
				};
			} finally {
				await task.destroy();
			}
		} finally {
			setPending(false);
		}
	}, []);

	return { rasterize, pending };
}
