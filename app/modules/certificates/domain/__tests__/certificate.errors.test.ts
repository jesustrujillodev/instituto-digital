import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	CERTIFICATE_ERROR_CODES,
	CertificateCourseNotFoundError,
	CertificateExportFailedError,
	CertificateExportUnavailableError,
	CertificateIssueNotFoundError,
	CertificateIssueRevokedError,
	CertificateNeverPublishedError,
	CertificateNotEditableError,
	CertificateSignatureInvalidError,
	CertificateSignatureNotOwnedError,
} from "../certificate.errors";

describe("errores del certificado", () => {
	test.each([
		[
			new CertificateCourseNotFoundError(),
			CERTIFICATE_ERROR_CODES.COURSE_NOT_FOUND,
		],
		[
			new CertificateNotEditableError("CANCELLED"),
			CERTIFICATE_ERROR_CODES.NOT_EDITABLE,
		],
		[
			new CertificateNeverPublishedError(),
			CERTIFICATE_ERROR_CODES.NEVER_PUBLISHED,
		],
		[
			new CertificateSignatureInvalidError("archivo vacío"),
			CERTIFICATE_ERROR_CODES.SIGNATURE_INVALID,
		],
		[
			new CertificateSignatureNotOwnedError(),
			CERTIFICATE_ERROR_CODES.SIGNATURE_NOT_OWNED,
		],
		[
			new CertificateIssueNotFoundError(),
			CERTIFICATE_ERROR_CODES.ISSUE_NOT_FOUND,
		],
		[new CertificateIssueRevokedError(), CERTIFICATE_ERROR_CODES.ISSUE_REVOKED],
		[
			new CertificateExportUnavailableError(),
			CERTIFICATE_ERROR_CODES.EXPORT_UNAVAILABLE,
		],
		[
			new CertificateExportFailedError("timeout"),
			CERTIFICATE_ERROR_CODES.EXPORT_FAILED,
		],
	])("%s lleva su código estable", (error, code) => {
		expect(isDomainError(error)).toBe(true);
		expect(error.code).toBe(code);
	});

	test("el curso cancelado viaja en los detalles", () => {
		expect(new CertificateNotEditableError("CANCELLED").details).toEqual({
			status: "CANCELLED",
		});
	});
});
