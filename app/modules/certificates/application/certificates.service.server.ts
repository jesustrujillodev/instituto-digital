import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	courseScopeWriteWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import {
	resolveTeachingScope,
	teachingCourseWhere,
} from "@/modules/teaching/domain/teaching.access";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { buildObjectKey } from "@/shared/storage/object-key";
import { toProxyRef } from "@/shared/storage/public-url";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { validateUploadInput } from "@/shared/storage/upload-validation";
import {
	CERTIFICATE_EXPORT,
	CERTIFICATE_SIGNATURE,
} from "../domain/certificate.config";
import {
	CertificateCourseNotFoundError,
	CertificateIssueNotFoundError,
	CertificateIssueRevokedError,
	CertificateNeverPublishedError,
	CertificateNotEditableError,
	CertificateSignatureInvalidError,
	CertificateSignatureNotOwnedError,
} from "../domain/certificate.errors";
import { toSampleRenderData } from "../domain/certificate.mapper";
import { renderCertificateDocument } from "../domain/certificate.renderer";
import {
	canEditCertificate,
	certificateFileName,
	certificateStateOf,
	isOwnSignatureRef,
	signatureFolderOf,
} from "../domain/certificate.rules";
import type { ICertificateService } from "../domain/certificate.service";
import type {
	CertificateCourse,
	CertificateDesign,
	CertificateExportFormat,
	CertificateFile,
	CertificateRenderData,
} from "../domain/certificate.types";

type Dependencies = {
	certificateRepository: ICradle["certificateRepository"];
	certificateExporter: ICradle["certificateExporter"];
	certificateAssetSource: ICradle["certificateAssetSource"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

export const createCertificateService = ({
	certificateRepository,
	certificateExporter,
	certificateAssetSource,
	clock,
	logger,
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ICertificateService => {
	const run = createOperationRunner(logger.child({ module: "certificates" }));

	/**
	 * Quién administra el certificado de un curso: el alcance de escritura sobre
	 * ese curso, igual que editar su ficha. Fuera de alcance responde igual que
	 * inexistente.
	 */
	const requireCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<CertificateCourse> => {
		const where = courseScopeWriteWhere(resolveCourseScope(actor));
		if (!where) throw new CertificateCourseNotFoundError();

		const course = await certificateRepository.findCourse(
			courseDocumentId,
			where,
		);
		if (!course) throw new CertificateCourseNotFoundError();
		return course;
	};

	const requireEditableCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	): Promise<CertificateCourse> => {
		const course = await requireCourse(courseDocumentId, actor);
		if (!canEditCertificate(course.status)) {
			throw new CertificateNotEditableError(course.status);
		}
		return course;
	};

	const assertOwnSignatures = (
		design: CertificateDesign,
		courseDocumentId: string,
	) => {
		for (const { signatureUrl } of design.signatories) {
			if (signatureUrl && !isOwnSignatureRef(signatureUrl, courseDocumentId)) {
				throw new CertificateSignatureNotOwnedError();
			}
		}
	};

	/**
	 * El archivo de un certificado. Todo lo que se dibuja viene de la base:
	 * ni el diseño ni los datos llegan nunca en la petición.
	 */
	const exportCertificate = async (
		design: CertificateDesign,
		data: CertificateRenderData,
		format: CertificateExportFormat,
	): Promise<CertificateFile> => {
		const assets = await certificateAssetSource.load(
			design.signatories.flatMap((signatory) =>
				signatory.enabled && signatory.signatureUrl
					? [signatory.signatureUrl]
					: [],
			),
		);
		const html = renderCertificateDocument(design, data, {
			assetBaseUrl: "",
			assets,
		});

		return {
			file: await certificateExporter.export(html, format),
			contentType: CERTIFICATE_EXPORT.contentTypes[format],
			fileName: certificateFileName(data.folio, format),
		};
	};

	return {
		async getEditor(courseDocumentId, actor) {
			return run("getEditor", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				const record = await certificateRepository.findRecord(course.id);

				return ok({ course, record, state: certificateStateOf(record) });
			});
		},

		async saveDraft({ documentId, design }, actor) {
			return run("saveDraft", async () => {
				const course = await requireEditableCourse(documentId, actor);
				assertOwnSignatures(design, course.documentId);

				await certificateRepository.saveDraft(course.id, design);
				return ok(null);
			});
		},

		async publish(courseDocumentId, actor) {
			return run("publish", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const { draft } = await certificateRepository.findRecord(course.id);

				await certificateRepository.publish(course.id, draft, clock.now());
				return ok(null);
			});
		},

		async discardDraft(courseDocumentId, actor) {
			return run("discardDraft", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const { published } = await certificateRepository.findRecord(course.id);
				if (!published) throw new CertificateNeverPublishedError();

				await certificateRepository.saveDraft(course.id, published);
				return ok(null);
			});
		},

		/**
		 * La firma se sube sola y el diseño la recoge al guardarse. Si nunca se
		 * guarda, el objeto queda huérfano y lo detecta el gestor de nube. Tampoco
		 * se borra la anterior al reemplazarla: el diseño publicado —y, desde
		 * F-09, una emisión— pueden seguir usándola.
		 */
		async uploadSignature(courseDocumentId, file, actor) {
			return run("uploadSignature", async () => {
				const reason = validateUploadInput(file, CERTIFICATE_SIGNATURE);
				if (reason) throw new CertificateSignatureInvalidError(reason);

				const course = await requireEditableCourse(courseDocumentId, actor);
				// Error de configuración, no de negocio: sale como UNEXPECTED.
				if (!storageBucket)
					throw new Error("STORAGE_BUCKET_NAME no configurado");

				const key = buildObjectKey(
					signatureFolderOf(course.documentId).slice(0, -1),
					file.name,
				);
				await storageProvider.uploadFile(
					bucketForKey(key, {
						defaultBucket: storageBucket,
						publicBucket: storagePublicBucket,
					}),
					key,
					Buffer.from(await file.arrayBuffer()),
					file.type,
				);

				return ok({ signatureUrl: toProxyRef(key) });
			});
		},

		async downloadIssue({ documentId, format }, actor) {
			return run("downloadIssue", async () => {
				const issue = await certificateRepository.findIssue(
					documentId,
					teachingCourseWhere(resolveTeachingScope(actor)),
				);
				if (!issue) throw new CertificateIssueNotFoundError();
				if (issue.revokedAt) throw new CertificateIssueRevokedError();

				return ok(await exportCertificate(issue.design, issue.data, format));
			});
		},

		async downloadSample({ documentId, version, format }, actor) {
			return run("downloadSample", async () => {
				const course = await requireCourse(documentId, actor);
				const { draft, published } = await certificateRepository.findRecord(
					course.id,
				);
				if (version === "published" && !published) {
					throw new CertificateNeverPublishedError();
				}
				const design = version === "published" && published ? published : draft;

				return ok(
					await exportCertificate(
						design,
						toSampleRenderData(course, design.folioFormat, clock.now()),
						format,
					),
				);
			});
		},
	};
};
