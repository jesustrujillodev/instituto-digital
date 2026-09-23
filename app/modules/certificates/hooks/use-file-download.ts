import { useCallback, useState } from "react";
import { sileo } from "sileo";

const FALLBACK_ERROR = "No se pudo descargar el archivo. Inténtalo de nuevo.";

/** El nombre de `Content-Disposition`, o el de reserva. */
const fileNameOf = (response: Response, fallback: string): string =>
	response.headers
		.get("Content-Disposition")
		?.match(/filename="([^"]+)"/)?.[1] ?? fallback;

/** El mensaje del error de ruta (`{ code, message }`), si el cuerpo lo trae. */
const messageOf = async (response: Response): Promise<string> => {
	try {
		const body: unknown = await response.json();
		const message = (body as { message?: unknown } | null)?.message;
		return typeof message === "string" ? message : FALLBACK_ERROR;
	} catch {
		return FALLBACK_ERROR;
	}
};

/**
 * Descarga de una ruta de recurso con aviso de error.
 *
 * Un `<a download>` no dice nada si el servidor responde un error: el navegador
 * solo marca la descarga como fallida. Aquí se lee la respuesta y, si falla, se
 * enseña el motivo (revocado, exportación no disponible…).
 */
export function useFileDownload() {
	const [pending, setPending] = useState<string | null>(null);

	const download = useCallback(async (url: string, fallbackName: string) => {
		setPending(url);
		try {
			const response = await fetch(url, { credentials: "same-origin" });
			if (!response.ok) {
				sileo.error({
					title: "La descarga falló",
					description: await messageOf(response),
				});
				return;
			}

			const href = URL.createObjectURL(await response.blob());
			const link = document.createElement("a");
			link.href = href;
			link.download = fileNameOf(response, fallbackName);
			document.body.append(link);
			link.click();
			link.remove();
			// Revocar en el mismo tick puede cancelar la descarga en algunos navegadores.
			setTimeout(() => URL.revokeObjectURL(href), 30_000);
		} catch {
			sileo.error({ title: "La descarga falló", description: FALLBACK_ERROR });
		} finally {
			setPending(null);
		}
	}, []);

	return { download, pending };
}
