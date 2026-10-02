import { describe, expect, test } from "vitest";
import { isDomainError } from "@/shared/errors/domain-error";
import {
	CERTIFICATE_ERROR_CODES,
	CertificateAssetInvalidError,
	CertificateAssetNotOwnedError,
	CertificateBackgroundInvalidError,
	CertificateCourseNotFoundError,
	CertificateExportFailedError,
	CertificateExportUnavailableError,
	CertificateForbiddenError,
	CertificateIssueNotFoundError,
	CertificateIssueRevokedError,
	CertificateLogoArchivedError,
	CertificateLogoInvalidError,
	CertificateLogoNotFoundError,
	CertificateNeverPublishedError,
	CertificateNotEditableError,
	CertificateTemplateNotFoundError,
	CertificateVerifyRateLimitedError,
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
			new CertificateAssetInvalidError("el archivo está vacío"),
			CERTIFICATE_ERROR_CODES.ASSET_INVALID,
		],
		[
			new CertificateAssetNotOwnedError(),
			CERTIFICATE_ERROR_CODES.ASSET_NOT_OWNED,
		],
		[
			new CertificateBackgroundInvalidError("encrypted"),
			CERTIFICATE_ERROR_CODES.BACKGROUND_INVALID,
		],
		[
			new CertificateLogoNotFoundError(),
			CERTIFICATE_ERROR_CODES.LOGO_NOT_FOUND,
		],
		[new CertificateLogoArchivedError(), CERTIFICATE_ERROR_CODES.LOGO_ARCHIVED],
		[
			new CertificateLogoInvalidError("pesa más de 2 MB"),
			CERTIFICATE_ERROR_CODES.LOGO_INVALID,
		],
		[
			new CertificateTemplateNotFoundError(),
			CERTIFICATE_ERROR_CODES.TEMPLATE_NOT_FOUND,
		],
		[new CertificateForbiddenError(), CERTIFICATE_ERROR_CODES.FORBIDDEN],
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
		[
			new CertificateVerifyRateLimitedError(1500),
			CERTIFICATE_ERROR_CODES.VERIFY_RATE_LIMITED,
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
