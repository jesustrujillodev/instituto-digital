import type { BackgroundRejection } from "../domain/certificate.errors";
import type { SanitizedPdf } from "../domain/certificate.pdf";

/** Lo que recibe el worker de saneado. */
export interface SanitizeRequest {
	bytes: Uint8Array;
	/** Lado admitido de la página, en puntos (`PAGE_SIDE_PT`). */
	pageSide: { min: number; max: number };
	/** Bytes descomprimidos admitidos entre todos los flujos del PDF. */
	maxDecodedBytes: number;
}

/** Lo que devuelve: el PDF reconstruido o el motivo del rechazo. */
export type SanitizeOutcome =
	| { ok: SanitizedPdf }
	| { rejected: Exclude<BackgroundRejection, "not_pdf" | "raster_mismatch"> };
