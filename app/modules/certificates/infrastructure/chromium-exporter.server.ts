import puppeteer, { type Browser } from "puppeteer-core";
import type { Logger } from "@/shared/logging/logger";
import {
	CERTIFICATE_CANVAS,
	CERTIFICATE_EXPORT,
} from "../domain/certificate.config";
import {
	CertificateExportFailedError,
	CertificateExportUnavailableError,
} from "../domain/certificate.errors";
import type { ICertificateExporter } from "../domain/certificate.exporter";

type Options = {
	/** Sin ruta no hay exportación: la descarga responde que no está disponible. */
	executablePath: string | null;
	/** Dentro del contenedor, que corre sin privilegios para el sandbox de Chromium. */
	noSandbox: boolean;
	logger: Logger;
};

/** Un contador de páginas abiertas; la siguiente espera a que se libere una. */
const createGate = (limit: number) => {
	let open = 0;
	const waiting: (() => void)[] = [];

	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (open >= limit)
			await new Promise<void>((resolve) => waiting.push(resolve));
		open++;
		try {
			return await task();
		} finally {
			open--;
			waiting.shift()?.();
		}
	};
};

/**
 * Exportador con el Chromium del sistema (D-01, docs/adr/0019).
 *
 * Un navegador por proceso, abierto la primera vez que se exporta y reabierto
 * si se cae. Cada exportación usa su propia página, sin JavaScript y sin red:
 * el documento llega autocontenido, así que cualquier petición que no sea un
 * `data:` se aborta y el HTML no puede alcanzar nada del servidor.
 */
export const createChromiumExporter = ({
	executablePath,
	noSandbox,
	logger,
}: Options): ICertificateExporter => {
	const log = logger.child({ module: "certificates", layer: "exporter" });
	const withPage = createGate(CERTIFICATE_EXPORT.maxConcurrentPages);
	let browser: Promise<Browser> | null = null;

	const openBrowser = (path: string) => {
		browser ??= puppeteer
			.launch({
				executablePath: path,
				headless: true,
				args: noSandbox
					? [
							"--no-sandbox",
							"--disable-setuid-sandbox",
							"--disable-dev-shm-usage",
						]
					: [],
			})
			.then((instance) => {
				instance.on("disconnected", () => {
					log.warn("chromium disconnected — will relaunch on next export");
					browser = null;
				});
				return instance;
			})
			.catch((error) => {
				browser = null;
				throw error;
			});
		return browser;
	};

	return {
		async export(html, format) {
			if (!executablePath) throw new CertificateExportUnavailableError();

			return withPage(async () => {
				const page = await (await openBrowser(executablePath)).newPage();
				try {
					page.setDefaultTimeout(CERTIFICATE_EXPORT.timeoutMs);
					await page.setJavaScriptEnabled(false);
					await page.setRequestInterception(true);
					page.on("request", (request) => {
						if (request.url().startsWith("data:")) request.continue();
						else request.abort();
					});
					await page.setViewport({
						...CERTIFICATE_CANVAS,
						deviceScaleFactor: CERTIFICATE_EXPORT.deviceScaleFactor,
					});
					await page.setContent(html, { waitUntil: "load" });
					// Sin esperar a las fuentes, el archivo sale con las de reserva.
					await page.evaluate(() => document.fonts.ready.then(() => true));

					const file =
						format === "pdf"
							? await page.pdf({
									width: `${CERTIFICATE_CANVAS.width}px`,
									height: `${CERTIFICATE_CANVAS.height}px`,
									printBackground: true,
									pageRanges: "1",
								})
							: await page.screenshot({ type: "png" });

					return new Uint8Array(file);
				} catch (error) {
					log.error("certificate export failed", { format, error });
					throw new CertificateExportFailedError("browser could not render");
				} finally {
					await page.close().catch(() => undefined);
				}
			});
		},
	};
};
