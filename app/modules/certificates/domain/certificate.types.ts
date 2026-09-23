import type * as v from "valibot";
import type { CourseStatus } from "@/modules/courses/domain/course.rules";
import type {
	CERTIFICATE_EXPORT_FORMATS,
	CertificateFontFile,
} from "./certificate.config";
import type {
	CertificateState,
	CertificateTemplateId,
	certificateDesignSchema,
	certificateRules,
	certificateSignatorySchema,
} from "./certificate.rules";

export type { CertificateTemplateId };

export type CertificateSignatory = v.InferOutput<
	typeof certificateSignatorySchema
>;

/** Lo que configura el capacitador y se persiste por curso. */
export type CertificateDesign = v.InferOutput<typeof certificateDesignSchema>;

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
}

/** Fuentes, logo y firmas como data URIs, leídos por el servidor. */
export interface CertificateAssets {
	fonts: Record<CertificateFontFile, string>;
	logo: string;
	/** Por referencia del diseño (`/api/storage?key=…`). */
	signatures: Record<string, string>;
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
}

export type SaveCertificateDraftDto = v.InferOutput<
	typeof certificateRules.saveDraft
>;

// ── Emisión y exportación (F-09) ──────────────────────────────────────────────

export type CertificateExportFormat =
	(typeof CERTIFICATE_EXPORT_FORMATS)[number];

/** A quién se emite: quien completó, con el nombre que se imprime. */
export interface IssueCandidate {
	userId: number;
	recipientName: string;
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
