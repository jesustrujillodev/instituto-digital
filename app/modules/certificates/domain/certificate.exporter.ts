import type {
	CertificateAssets,
	CertificateExportFormat,
} from "./certificate.types";

/**
 * Convierte el documento del certificado en un archivo (D-01).
 *
 * Recibe el HTML ya autocontenido: el adaptador no resuelve recursos ni sabe de
 * plantillas, así que cambiar de motor no toca una sola plantilla.
 */
export interface ICertificateExporter {
	export(
		html: string,
		format: CertificateExportFormat,
	): Promise<Uint8Array<ArrayBuffer>>;
}

/** Lee fuentes, logo y firmas para incrustarlos en el documento. */
export interface ICertificateAssetSource {
	/**
	 * Lanza `CertificateExportFailedError` si una firma no se puede leer: un
	 * certificado sin una de sus firmas no se entrega.
	 */
	load(signatureRefs: readonly string[]): Promise<CertificateAssets>;
}
