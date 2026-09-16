import { downloadZip } from "client-zip";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { sileo } from "sileo";
import type { ZipManifest } from "../domain/cloud.types";
import {
	CLOUD_INTENTS,
	type CloudActionData,
	toSelectionFormData,
} from "../utils/cloud-intents";

// ===============================================================
// ZIP armado en el navegador
// ===============================================================
// El servidor solo firma URLs. El navegador baja cada archivo DIRECTO del bucket
// y lo va metiendo en el ZIP en streaming: ni un byte pasa por el servidor.
// Requiere CORS (GET) en los buckets — docs/storage/00-sistema-almacenamiento.md.

export type ZipDownloadState =
	| { phase: "idle" }
	| { phase: "preparing"; fileName: string }
	| { phase: "downloading"; fileName: string; loaded: number; total: number };

// `showSaveFilePicker` solo existe en Chromium y no está en lib.dom.
type SaveFilePicker = (options: {
	suggestedName: string;
	types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;

/** Un archivo del manifiesto no se pudo bajar (p. ej. firma caducada: 403). */
class ZipEntryError extends Error {
	constructor(
		readonly path: string,
		readonly status: number,
	) {
		super(`No se pudo descargar ${path} (${status})`);
	}
}

const PROGRESS_PAINT_MS = 150;

/** Guarda un Blob con un enlace temporal: el camino de Firefox y Safari. */
const saveBlob = (blob: Blob, fileName: string) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	// Revocar en el mismo tick puede cancelar la descarga en algunos navegadores.
	setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

const describeFailure = (error: unknown): string => {
	if (error instanceof ZipEntryError) {
		return error.status === 403
			? "Los enlaces de descarga caducaron antes de terminar. Vuelve a intentarlo con menos archivos."
			: `No se pudo descargar ${error.path}.`;
	}
	// `fetch` rechaza con TypeError sin más detalle cuando el navegador bloquea la
	// respuesta: con URLs firmadas válidas, casi siempre es CORS del bucket.
	if (error instanceof TypeError) {
		return "El navegador no pudo leer los archivos del almacenamiento. Revisa que el bucket permita CORS para este dominio.";
	}
	return "No se pudo generar el ZIP.";
};

export function useZipDownload() {
	const fetcher = useFetcher<CloudActionData>({ key: "cloud-zip-manifest" });
	const [state, setState] = useState<ZipDownloadState>({ phase: "idle" });
	// Espejo de `state` para los efectos: decidir dentro de un updater de
	// `setState` ejecutaría la descarga dos veces en StrictMode.
	const stateRef = useRef(state);
	stateRef.current = state;

	const sinkRef = useRef<WritableStream<Uint8Array> | null>(null);
	const controllerRef = useRef<AbortController | null>(null);
	const handledRef = useRef<CloudActionData | undefined>(fetcher.data);

	const reset = useCallback(() => {
		sinkRef.current = null;
		controllerRef.current = null;
		setState({ phase: "idle" });
	}, []);

	const run = useCallback(
		async (manifest: ZipManifest, fileName: string) => {
			const controller = new AbortController();
			controllerRef.current = controller;
			setState({
				phase: "downloading",
				fileName,
				loaded: 0,
				total: manifest.totalBytes,
			});

			// Generador: cada `fetch` ocurre cuando el ZIP pide el siguiente archivo,
			// no todos a la vez.
			async function* entries() {
				for (const entry of manifest.entries) {
					const response = await fetch(entry.url, {
						signal: controller.signal,
					});
					if (!response.ok)
						throw new ZipEntryError(entry.path, response.status);
					yield { name: entry.path, input: response, size: entry.size };
				}
			}

			let loaded = 0;
			let lastPaint = 0;
			const counter = new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, output) {
					loaded += chunk.byteLength;
					const now = performance.now();
					if (now - lastPaint > PROGRESS_PAINT_MS) {
						lastPaint = now;
						setState((current) =>
							current.phase === "downloading"
								? { ...current, loaded: Math.min(loaded, current.total) }
								: current,
						);
					}
					output.enqueue(chunk);
				},
			});

			try {
				const body = downloadZip(entries()).body;
				if (!body) throw new Error("ZIP sin contenido");
				const stream = body.pipeThrough(counter);

				if (sinkRef.current) {
					// Directo a disco: el ZIP nunca está entero en memoria.
					await stream.pipeTo(sinkRef.current, { signal: controller.signal });
				} else {
					saveBlob(await new Response(stream).blob(), fileName);
				}

				sileo.success({ title: "Descarga lista", description: fileName });
			} catch (error) {
				if (controller.signal.aborted) {
					sileo.info({ title: "Descarga cancelada" });
				} else {
					sileo.error({
						title: "La descarga falló",
						description: describeFailure(error),
					});
				}
				await sinkRef.current?.abort().catch(() => {});
			} finally {
				reset();
			}
		},
		[reset],
	);

	useEffect(() => {
		const data = fetcher.data;
		if (fetcher.state !== "idle" || !data || data === handledRef.current)
			return;
		handledRef.current = data;

		const current = stateRef.current;
		// Cancelado mientras se preparaba: la respuesta llega tarde y se ignora.
		if (current.phase !== "preparing") return;

		if (!data.success) {
			sileo.error({
				title: "No se pudo preparar el ZIP",
				description: data.error.message,
			});
			void sinkRef.current?.abort().catch(() => {});
			reset();
			return;
		}
		if (data.data.intent === CLOUD_INTENTS.zipManifest) {
			// Si se eligió archivo en disco, su nombre ya está decidido.
			const fileName = sinkRef.current
				? current.fileName
				: data.data.manifest.fileName;
			void run(data.data.manifest, fileName);
		}
	}, [fetcher.data, fetcher.state, run, reset]);

	// Salir de la pantalla a media descarga la cancela en vez de dejarla huérfana.
	useEffect(() => () => controllerRef.current?.abort(), []);

	const start = useCallback(
		async (
			selection: { keys: readonly string[]; prefixes: readonly string[] },
			suggestedName: string,
		) => {
			if (state.phase !== "idle") return;

			// El selector de archivo se abre ANTES de pedir el manifiesto: el
			// navegador solo lo permite dentro del gesto del clic.
			const picker = (window as { showSaveFilePicker?: SaveFilePicker })
				.showSaveFilePicker;
			if (typeof picker === "function") {
				try {
					// `.call(window)`: separado de `window`, el navegador lo rechaza con
					// "Illegal invocation".
					const handle = await picker.call(window, {
						suggestedName,
						types: [
							{
								description: "Archivo ZIP",
								accept: { "application/zip": [".zip"] },
							},
						],
					});
					sinkRef.current = await handle.createWritable();
				} catch (error) {
					// Cerrar el selector es cancelar; cualquier otro fallo cae al Blob.
					if ((error as { name?: string }).name === "AbortError") return;
					sinkRef.current = null;
				}
			}

			setState({ phase: "preparing", fileName: suggestedName });
			fetcher.submit(
				toSelectionFormData(CLOUD_INTENTS.zipManifest, selection),
				{ method: "post" },
			);
		},
		[fetcher, state.phase],
	);

	const cancel = useCallback(() => {
		if (controllerRef.current) {
			controllerRef.current.abort();
			return;
		}
		// Aún preparando: no hay nada que abortar en red, solo se descarta.
		void sinkRef.current?.abort().catch(() => {});
		reset();
	}, [reset]);

	return { state, start, cancel };
}
