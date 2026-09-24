import * as v from "valibot";
import { certificateRules } from "./certificate.rules";

export const validateCertificateCourse = (data: unknown) =>
	v.parse(certificateRules.course, data);
export const validateSaveCertificateDraft = (data: unknown) =>
	v.parse(certificateRules.saveDraft, data);
export const validateDownloadCertificate = (data: unknown) =>
	v.parse(certificateRules.download, data);
export const validateDownloadSample = (data: unknown) =>
	v.parse(certificateRules.sample, data);
export const validateVerifyCertificate = (data: unknown) =>
	v.parse(certificateRules.verify, data);
export const validateSaveCertificateDelivery = (data: unknown) =>
	v.parse(certificateRules.delivery, data);
