import type { CertificateAssets } from "./certificate.types";
import type { AssetManifest, ExportProfile } from "./design/design.assets";

/**
 * Convierte el documento del certificado en un archivo (D-01).
 *
 * Recibe el HTML ya autocontenido y el perfil que sale del diseño
 * (`exportProfileOf`): el adaptador no resuelve recursos ni sabe de diseños,
 * así que cambiar de motor no toca el renderizador.
 */
export interface ICertificateExporter {
	export(
		html: string,
		profile: ExportProfile,
	): Promise<Uint8Array<ArrayBuffer>>;
}

/** De dónde sale un logo: del código (`public/`) o de storage. */
export type LogoSource =
	| { kind: "builtin"; path: string }
	| { kind: "storage"; key: string };

/** Lee lo que el diseño imprime para incrustarlo en el documento. */
export interface ICertificateAssetSource {
	/**
	 * Lanza `CertificateExportFailedError` si un recurso no se puede leer: un
	 * certificado sin una de sus firmas o imágenes no se entrega.
	 *
	 * @param logos De dónde leer cada logo del manifiesto; lo resuelve quien
	 *   llama, que tiene acceso a la tabla de logos.
	 */
	load(
		manifest: AssetManifest,
		logos: Readonly<Record<string, LogoSource>>,
	): Promise<CertificateAssets>;
	/** Los bytes del PDF de fondo ya saneado, para componer el vectorial. */
	loadBackgroundPdf(ref: string): Promise<Uint8Array>;
}
