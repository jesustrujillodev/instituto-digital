/** Un PDF de fondo ya reconstruido: solo su primera página, sin nada activo. */
export interface SanitizedPdf {
	bytes: Uint8Array;
	widthPt: number;
	heightPt: number;
}

/**
 * Operaciones sobre PDF del fondo vectorial (ADR 0029). El adaptador vive en
 * infraestructura; aquí solo el contrato.
 */
export interface ICertificatePdfTools {
	/**
	 * Reconstruye la primera página en un documento nuevo: sin JavaScript,
	 * anotaciones, formularios ni adjuntos, con la rotación y el recorte
	 * aplicados. Lanza `CertificateBackgroundInvalidError`.
	 */
	sanitize(bytes: Uint8Array): Promise<SanitizedPdf>;
	/**
	 * Estampa la capa de Chromium (fondo transparente) sobre el PDF de fondo,
	 * anclada arriba a la izquierda. Devuelve un PDF de una página.
	 */
	overlay(
		base: Uint8Array,
		layer: Uint8Array,
	): Promise<Uint8Array<ArrayBuffer>>;
}
