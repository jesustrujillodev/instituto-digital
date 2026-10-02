import * as v from "valibot";
import { certificateRules } from "./certificate.rules";
import { certificateLogoRules } from "./certificate-logo.rules";
import { certificateTemplateRules } from "./certificate-template.rules";

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
export const validateUploadLogo = (data: unknown) =>
	v.parse(certificateLogoRules.upload, data);
export const validateLogoTarget = (data: unknown) =>
	v.parse(certificateLogoRules.target, data);
export const validateArchiveLogo = (data: unknown) =>
	v.parse(certificateLogoRules.archive, data);
export const validateTemplateTarget = (data: unknown) =>
	v.parse(certificateTemplateRules.target, data);
export const validateCreateTemplate = (data: unknown) =>
	v.parse(certificateTemplateRules.create, data);
export const validateRenameTemplate = (data: unknown) =>
	v.parse(certificateTemplateRules.rename, data);
export const validateSaveTemplateDesign = (data: unknown) =>
	v.parse(certificateTemplateRules.saveDesign, data);
export const validateArchiveTemplate = (data: unknown) =>
	v.parse(certificateTemplateRules.archive, data);
export const validateTemplateFromCourse = (data: unknown) =>
	v.parse(certificateTemplateRules.fromCourse, data);
export const validateApplyTemplate = (data: unknown) =>
	v.parse(certificateTemplateRules.apply, data);
