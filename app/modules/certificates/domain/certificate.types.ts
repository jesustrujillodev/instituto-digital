import type * as v from "valibot";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type { UploadInput } from "@/shared/storage/upload-validation";
import type {
	CERTIFICATE_EXPORT_FORMATS,
	CertificateFontFile,
} from "./certificate.config";
import type { CertificateState, certificateRules } from "./certificate.rules";
import type { CertificateDesign } from "./design/design.schema";
import type {
	CertificateDesignV1,
	CertificateSignatory,
	CertificateTemplateId,
} from "./design/design-v1.schema";
import type { CertificateDesignV2 } from "./design/design-v2.schema";

export type {
	CertificateDesign,
	CertificateDesignV1,
	CertificateDesignV2,
	CertificateSignatory,
	CertificateTemplateId,
};

/**
 * Lo que aporta el sistema al emitir. Nunca se persiste en el diseño: si
 * viviera ahí, editar la plantilla podría reescribir a quién se otorgó.
 *
 * Los textos llegan ya formateados; el renderer no sabe de fechas ni de
 * plurales.
 */
export interface CertificateRenderData {
	recipientName: string;
	courseTitle: string;
	courseDescription: string;
	dependencyName: string;
	/** «20 horas», o null para omitir la línea. */
	hours: string | null;
	issuedOn: string;
	folio: string;
	/**
	 * La dirección que codifica el QR del pie. No se congela: se calcula al
	 * descargar, así que también los certificados emitidos antes la llevan.
	 */
	verificationUrl?: string | null;
}

export interface CertificateRenderOptions {
	/**
	 * Base contra la que se resuelven fuentes y logo: `""` dentro de la app,
	 * una ruta a `public/` en las muestras locales y una URL absoluta al
	 * exportar. Es configuración del sistema, nunca dato de una persona.
	 */
	assetBaseUrl: string;
	/** Recursos incrustados para exportar; sin ellos, se piden por URL. */
	assets?: CertificateAssets;
	/** URL pública de cada logo institucional subido, para la vista previa. */
	logoUrls?: Record<string, string>;
	/**
	 * `overlay` pinta solo los elementos sobre fondo transparente: la capa que
	 * se estampa encima de un PDF de fondo (v2).
	 */
	mode?: "full" | "overlay";
}

/**
 * Lo que el exportador incrusta como data URIs, leído por el servidor. Solo
 * trae lo que el diseño usa (`assetManifestOf`).
 */
export interface CertificateAssets {
	/** Avant Garde de las plantillas v1. */
	fonts?: Record<CertificateFontFile, string>;
	/** Logo blanco de las plantillas v1. */
	logo?: string;
	/** Por clave de cara del catálogo (`eb-garamond-400`), para v2. */
	faces: Record<string, string>;
	/** Por id de logo, para v2. */
	logos: Record<string, string>;
	/** Firmas e imágenes por referencia del diseño (`/api/storage?key=…`). */
	images: Record<string, string>;
}

export interface CertificateRenderResult {
	html: string;
	styles: string;
}

// ── Editor del certificado (F-08) ─────────────────────────────────────────────

export type { CertificateState };

/** El curso tal como lo necesita el editor: su alcance y sus datos de muestra. */
export interface CertificateCourse {
	id: number;
	documentId: string;
	status: CourseStatus;
	title: string;
	description: string | null;
	dependencyName: string;
	/** Ya resueltas por `courseHoursOf`: capturadas o las de sus sesiones. */
	hours: number | null;
}

/** El diseño guardado de un curso, ya leído con tolerancia. */
export interface CertificateRecord {
	draft: CertificateDesign;
	published: CertificateDesign | null;
	publishedAt: Date | null;
	/** Sin fila todavía: el curso usa el diseño por defecto. */
	exists: boolean;
}

export interface CertificateEditor {
	course: CertificateCourse;
	record: CertificateRecord;
	state: CertificateState;
	delivery: CertificateDelivery;
}

/**
 * Cómo llega el certificado a quien lo recibe. No es diseño: rige desde que se
 * guarda, también para lo ya emitido.
 */
export interface CertificateDelivery {
	isDownloadable: boolean;
	emailMessage: string | null;
}

export type SaveCertificateDraftDto = v.InferOutput<
	typeof certificateRules.saveDraft
>;

export interface UploadedImage {
	ref: string;
	widthPx: number;
	heightPx: number;
}

export interface UploadBackgroundDto {
	documentId: string;
	pdf: UploadInput;
	raster: UploadInput;
	rasterDpi: number;
}

export interface UploadedBackground {
	pdfRef: string;
	rasterRef: string;
	rasterDpi: number;
	widthPt: number;
	heightPt: number;
}

// ── Emisión y exportación (F-09) ──────────────────────────────────────────────

export type CertificateExportFormat =
	(typeof CERTIFICATE_EXPORT_FORMATS)[number];

/**
 * A quién se emite: quien completó, con el nombre que se imprime y los datos
 * del correo que avisa de la emisión.
 */
export interface IssueCandidate {
	userId: number;
	recipientName: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
}

/** Lo que el diff necesita de una emisión ya guardada. */
export interface StoredIssue {
	userId: number;
	revokedAt: Date | null;
}

export interface IssueDiff {
	issue: IssueCandidate[];
	restore: number[];
	revoke: number[];
}

/** Una emisión lista para escribirse, con sus dos snapshots. */
export interface NewCertificateIssue {
	userId: number;
	folio: string;
	design: CertificateDesign;
	data: CertificateRenderData;
}

/** Una emisión tal como se descarga: todo sale de lo congelado. */
export interface CertificateIssueRecord {
	documentId: string;
	courseId: number;
	folio: string;
	revokedAt: Date | null;
	design: CertificateDesign;
	data: CertificateRenderData;
}

/** El resumen de una sincronización, para el aviso de quien finaliza. */
export interface IssuanceResult {
	issued: number;
	restored: number;
	revoked: number;
}

/** Un archivo listo para responder a una descarga. */
export interface CertificateFile {
	file: Uint8Array<ArrayBuffer>;
	contentType: string;
	fileName: string;
}

export type SampleVersion = "draft" | "published";

export type DownloadCertificateDto = v.InferOutput<
	typeof certificateRules.download
>;
export type DownloadSampleDto = v.InferOutput<typeof certificateRules.sample>;

// ── Verificación pública (F-10) ───────────────────────────────────────────────

/**
 * Lo que responde la verificación pública. Solo lo que ya está impreso en el
 * certificado: ni correo, ni ids internos. Un revocado no dice de quién era.
 */
export type CertificateVerification =
	| {
			status: "valid";
			folio: string;
			recipientName: string;
			courseTitle: string;
			dependencyName: string;
			hours: string | null;
			issuedOn: string;
	  }
	| { status: "revoked"; folio: string };

/** Lo que el repositorio lee para verificar, sin guarda de alcance. */
export interface VerifiableIssue {
	folio: string;
	revokedAt: Date | null;
	data: CertificateRenderData;
}

// ── Entrega al participante (F-11) ────────────────────────────────────────────

/** Un certificado vigente de quien está en sesión, tal como lo lista. */
export interface MyCertificate {
	documentId: string;
	folio: string;
	courseTitle: string;
	dependencyName: string;
	hours: string | null;
	issuedOn: string;
	downloadable: boolean;
	verificationPath: string;
}

/** Una emisión propia para descargar: lo congelado y si el curso lo permite. */
export interface MyIssueRecord {
	documentId: string;
	design: CertificateDesign;
	data: CertificateRenderData;
	downloadable: boolean;
}

export type SaveCertificateDeliveryDto = v.InferOutput<
	typeof certificateRules.delivery
>;

// ── Logos institucionales (ADR 0030) ──────────────────────────────────────────

/** Un logo subido. Inmutable: reemplazarlo crea otro y archiva este. */
export interface InstitutionalLogo {
	documentId: string;
	name: string;
	storageKey: string;
	contentType: string;
	widthPx: number;
	heightPx: number;
	archivedAt: Date | null;
	createdAt: Date;
	/** El logo al que este reemplazó. */
	previousDocumentId: string | null;
}

/** Un logo tal como lo ofrece el editor: integrado o subido, con su URL. */
export interface LogoOption {
	id: string;
	name: string;
	url: string;
	widthPx: number;
	heightPx: number;
	builtin: boolean;
	archived: boolean;
}

export interface NewInstitutionalLogo {
	name: string;
	storageKey: string;
	contentType: string;
	widthPx: number;
	heightPx: number;
	createdById: number;
}

// ── Biblioteca de plantillas (ADR 0030) ───────────────────────────────────────

export type CertificateTemplateScope = "INSTITUTIONAL" | "DEPENDENCY";

/** Un diseño reutilizable. Aplicarlo copia su diseño e imágenes al curso. */
export interface CertificateTemplate {
	documentId: string;
	name: string;
	description: string | null;
	scope: CertificateTemplateScope;
	dependencyId: number | null;
	dependencyName: string | null;
	design: CertificateDesignV2;
	archivedAt: Date | null;
	updatedAt: Date;
}

/** Una plantilla tal como la ve quien pregunta: con lo que puede hacer. */
export interface CertificateTemplateView extends CertificateTemplate {
	canEdit: boolean;
}

export interface NewCertificateTemplate {
	name: string;
	description: string | null;
	scope: CertificateTemplateScope;
	dependencyId: number | null;
	design: CertificateDesignV2;
	createdById: number;
}
