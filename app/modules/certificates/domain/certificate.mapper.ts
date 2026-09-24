import * as v from "valibot";
import { formatZonedLongDate, utcToZonedInput } from "@/lib/date-utils";
import {
	CERTIFICATE_SAMPLE_RECIPIENT,
	CERTIFICATE_SAMPLE_VERIFICATION_PATH,
	verificationPathOf,
} from "./certificate.config";
import type { MyCertificateRow } from "./certificate.repository";
import { certificateDesignSchema, resolveFolio } from "./certificate.rules";
import type {
	CertificateCourse,
	CertificateDesign,
	CertificateRenderData,
	CertificateVerification,
	MyCertificate,
	VerifiableIssue,
} from "./certificate.types";

/**
 * El blob guardado como diseño, o null si no valida.
 *
 * Nunca lanza: una fila escrita con un esquema anterior no puede tumbar la
 * pantalla. La caída al diseño por defecto —y su log— es del repositorio, que
 * es quien tiene el logger (mismo reparto que `theme.mapper.ts`).
 */
export const toCertificateDesign = (
	blob: unknown,
): CertificateDesign | null => {
	const result = v.safeParse(certificateDesignSchema, blob);
	return result.success ? result.output : null;
};

/** "20 horas", "1 hora", o null sin horas. */
export const formatCertificateHours = (hours: number | null): string | null => {
	if (hours === null) return null;

	const value = new Intl.NumberFormat("es-MX", {
		maximumFractionDigits: 1,
	}).format(hours);
	return hours === 1 ? `${value} hora` : `${value} horas`;
};

/** Año y mes de un instante en la zona del instituto: los de `{year}` y `{month}`. */
export const folioPartsOf = (at: Date): { year: number; month: number } => {
	const [year, month] = utcToZonedInput(at).date.split("-").map(Number);
	return { year, month };
};

/**
 * Lo que se imprime de un curso para una persona, con el folio ya resuelto. Es
 * lo que se congela al emitir.
 */
export const toIssueRenderData = (
	course: CertificateCourse,
	recipientName: string,
	folio: string,
	issuedAt: Date,
): CertificateRenderData => ({
	recipientName,
	courseTitle: course.title,
	courseDescription: course.description ?? "",
	dependencyName: course.dependencyName,
	hours: formatCertificateHours(course.hours),
	issuedOn: formatZonedLongDate(issuedAt),
	folio,
});

/**
 * Los datos con los que se ve el certificado mientras se diseña: el curso real
 * y una persona de muestra, con el primer folio del formato elegido. El QR
 * lleva una dirección de muestra, que la verificación responde como inexistente.
 */
export const toSampleRenderData = (
	course: CertificateCourse,
	folioFormat: string,
	today: Date,
	verificationBase = "",
): CertificateRenderData => ({
	...toIssueRenderData(
		course,
		CERTIFICATE_SAMPLE_RECIPIENT,
		resolveFolio(folioFormat, { seq: 1, ...folioPartsOf(today) }),
		today,
	),
	verificationUrl: `${verificationBase}${CERTIFICATE_SAMPLE_VERIFICATION_PATH}`,
});

const renderDataSchema = v.object({
	recipientName: v.string(),
	courseTitle: v.string(),
	courseDescription: v.string(),
	dependencyName: v.string(),
	hours: v.nullable(v.string()),
	issuedOn: v.string(),
	folio: v.string(),
});

/** Los datos congelados de una emisión, o null si el blob no valida. Nunca lanza. */
export const toCertificateRenderData = (
	blob: unknown,
): CertificateRenderData | null => {
	const result = v.safeParse(renderDataSchema, blob);
	return result.success ? result.output : null;
};

/**
 * La respuesta pública, campo por campo: nunca se copia el snapshot entero,
 * para que un campo nuevo en él no se publique sin decidirlo. Un revocado no
 * dice de quién era ni de qué curso.
 */
export const toCertificateVerification = (
	issue: VerifiableIssue,
): CertificateVerification =>
	issue.revokedAt
		? { status: "revoked", folio: issue.folio }
		: {
				status: "valid",
				folio: issue.folio,
				recipientName: issue.data.recipientName,
				courseTitle: issue.data.courseTitle,
				dependencyName: issue.data.dependencyName,
				hours: issue.data.hours,
				issuedOn: issue.data.issuedOn,
			};

/** Una fila de «Mis certificados»: lo impreso, si se descarga y cómo se verifica. */
export const toMyCertificate = (row: MyCertificateRow): MyCertificate => ({
	documentId: row.documentId,
	folio: row.data.folio,
	courseTitle: row.data.courseTitle,
	dependencyName: row.data.dependencyName,
	hours: row.data.hours,
	issuedOn: row.data.issuedOn,
	downloadable: row.downloadable,
	verificationPath: verificationPathOf(row.documentId),
});
