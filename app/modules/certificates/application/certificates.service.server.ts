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
import {
	CERTIFICATE_EXPORT,
	verificationPathOf,
} from "../domain/certificate.config";
import {
	CertificateAssetMissingError,
	CertificateAssetNotOwnedError,
	CertificateCourseNotFoundError,
	CertificateDownloadDisabledError,
	CertificateIssueNotFoundError,
	CertificateIssueRevokedError,
	CertificateLogoArchivedError,
	CertificateLogoNotFoundError,
	CertificateNeverPublishedError,
	CertificateNotEditableError,
} from "../domain/certificate.errors";
import type { LogoSource } from "../domain/certificate.exporter";
import {
	toCertificateVerification,
	toMyCertificate,
	toSampleRenderData,
} from "../domain/certificate.mapper";
import { renderCertificateDocument } from "../domain/certificate.renderer";
import {
	canEditCertificate,
	certificateFileName,
	certificateStateOf,
} from "../domain/certificate.rules";
import type { ICertificateService } from "../domain/certificate.service";
import type {
	CertificateCourse,
	CertificateDesign,
	CertificateExportFormat,
	CertificateFile,
	CertificateRecord,
	CertificateRenderData,
} from "../domain/certificate.types";
import {
	certificateAssetFolderOf,
	isOwnCertificateAssetRef,
} from "../domain/certificate-assets.rules";
import {
	assetManifestOf,
	backgroundPdfRefOf,
	exportProfileOf,
	logoIdsOf,
	storageRefsOf,
} from "../domain/design/design.assets";
import { builtinLogoOf } from "../domain/design/logos";
import {
	missingRefsOf,
	storeCertificateBackground,
	storeCertificateImage,
} from "./certificate-uploads.server";

type Dependencies = {
	certificateRepository: ICradle["certificateRepository"];
	certificateExporter: ICradle["certificateExporter"];
	certificateAssetSource: ICradle["certificateAssetSource"];
	certificateLogoRepository: ICradle["certificateLogoRepository"];
	certificatePdfTools: ICradle["certificatePdfTools"];
	appBaseUrl: ICradle["appBaseUrl"];
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
	certificateLogoRepository,
	certificatePdfTools,
	appBaseUrl,
	clock,
	logger,
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ICertificateService => {
	const run = createOperationRunner(logger.child({ module: "certificates" }));
	const uploads = { storageProvider, storageBucket, storagePublicBucket };

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

	/** Toda imagen y fondo del diseño, subidos a ESTE curso. */
	const assertOwnAssets = (
		design: CertificateDesign,
		courseDocumentId: string,
	) => {
		for (const ref of storageRefsOf(design)) {
			if (!isOwnCertificateAssetRef(ref, courseDocumentId)) {
				throw new CertificateAssetNotOwnedError();
			}
		}
	};

	/**
	 * Los logos subidos que el diseño nombra existen. Uno archivado solo pasa
	 * si el diseño guardado ya lo usaba: sigue pintándose, pero no se elige.
	 */
	const assertLogos = async (
		design: CertificateDesign,
		stored: CertificateRecord,
	) => {
		const uploaded = logoIdsOf(design).filter((id) => !builtinLogoOf(id));
		if (uploaded.length === 0) return;

		const logos = await certificateLogoRepository.findByDocumentIds(uploaded);
		const known = new Map(logos.map((logo) => [logo.documentId, logo]));
		const alreadyUsed = new Set([
			...logoIdsOf(stored.draft),
			...(stored.published ? logoIdsOf(stored.published) : []),
		]);
		for (const id of uploaded) {
			const logo = known.get(id);
			if (!logo) throw new CertificateLogoNotFoundError();
			if (logo.archivedAt && !alreadyUsed.has(id)) {
				throw new CertificateLogoArchivedError();
			}
		}
	};

	/**
	 * Lo que el diseño estrena y ya no está en storage: entre subirlo y guardar
	 * pudo borrarse desde la nube. Lo ya guardado no hace falta mirarlo:
	 * borrarlo desde la nube lo quita también del diseño.
	 */
	const missingAddedRefsOf = (
		design: CertificateDesign,
		stored: CertificateRecord,
	) => {
		const saved = new Set([
			...storageRefsOf(stored.draft),
			...(stored.published ? storageRefsOf(stored.published) : []),
		]);
		return missingRefsOf(
			uploads,
			storageRefsOf(design).filter((ref) => !saved.has(ref)),
		);
	};

	const assertSavable = async (
		design: CertificateDesign,
		course: CertificateCourse,
	) => {
		assertOwnAssets(design, course.documentId);
		const stored = await certificateRepository.findRecord(course.id);
		const [, missing] = await Promise.all([
			assertLogos(design, stored),
			missingAddedRefsOf(design, stored),
		]);
		if (missing.length > 0) throw new CertificateAssetMissingError();
	};

	/** De dónde leer cada logo del diseño al exportar. */
	const logoSourcesOf = async (
		logoIds: readonly string[],
	): Promise<Record<string, LogoSource>> => {
		const sources: Record<string, LogoSource> = {};
		const uploaded: string[] = [];
		for (const id of logoIds) {
			const builtin = builtinLogoOf(id);
			if (builtin) sources[id] = { kind: "builtin", path: builtin.path };
			else uploaded.push(id);
		}
		const logos = await certificateLogoRepository.findByDocumentIds(uploaded);
		for (const logo of logos) {
			sources[logo.documentId] = { kind: "storage", key: logo.storageKey };
		}
		return sources;
	};

	/**
	 * El archivo de un certificado. Todo lo que se dibuja viene de la base:
	 * ni el diseño ni los datos llegan nunca en la petición.
	 *
	 * Con un PDF de fondo y formato PDF, Chromium pinta solo la capa de
	 * elementos sobre fondo transparente y se estampa encima del PDF original:
	 * el fondo sale vectorial, no rasterizado.
	 */
	const exportCertificate = async (
		design: CertificateDesign,
		data: CertificateRenderData,
		format: CertificateExportFormat,
	): Promise<CertificateFile> => {
		const manifest = assetManifestOf(design);
		const backgroundPdf = format === "pdf" ? backgroundPdfRefOf(design) : null;
		const [assets, base] = await Promise.all([
			logoSourcesOf(manifest.logoIds).then((logos) =>
				certificateAssetSource.load(manifest, logos),
			),
			backgroundPdf
				? certificateAssetSource.loadBackgroundPdf(backgroundPdf)
				: null,
		]);

		const html = renderCertificateDocument(design, data, {
			assetBaseUrl: "",
			assets,
			mode: base ? "overlay" : "full",
		});
		const rendered = await certificateExporter.export(
			html,
			exportProfileOf(design, format, { transparent: base !== null }),
		);

		return {
			file: base ? await certificatePdfTools.overlay(base, rendered) : rendered,
			contentType: CERTIFICATE_EXPORT.contentTypes[format],
			fileName: certificateFileName(data.folio, format),
		};
	};

	return {
		async getEditor(courseDocumentId, actor) {
			return run("getEditor", async () => {
				const course = await requireCourse(courseDocumentId, actor);
				const [record, delivery] = await Promise.all([
					certificateRepository.findRecord(course.id),
					certificateRepository.findDelivery(course.id),
				]);

				return ok({
					course,
					record,
					state: certificateStateOf(record),
					delivery,
				});
			});
		},

		async saveDraft({ documentId, design }, actor) {
			return run("saveDraft", async () => {
				const course = await requireEditableCourse(documentId, actor);
				await assertSavable(design, course);

				await certificateRepository.saveDraft(course.id, design);
				return ok(null);
			});
		},

		async publish({ documentId, design }, actor) {
			return run("publish", async () => {
				const course = await requireEditableCourse(documentId, actor);
				await assertSavable(design, course);

				await certificateRepository.publish(course.id, design, clock.now());
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
		 * La imagen se sube sola y el diseño la recoge al guardarse. Si nunca se
		 * guarda, el objeto queda huérfano y lo detecta el gestor de nube. Nada
		 * se borra al reemplazar: el publicado o una emisión pueden usarla. La
		 * misma imagen subida dos veces cae en el mismo objeto.
		 */
		async uploadImage(courseDocumentId, file, actor) {
			return run("uploadImage", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				return ok(
					await storeCertificateImage(
						uploads,
						certificateAssetFolderOf(course.documentId, "image"),
						file,
					),
				);
			});
		},

		async uploadBackground({ documentId, ...input }, actor) {
			return run("uploadBackground", async () => {
				const course = await requireEditableCourse(documentId, actor);
				return ok(
					await storeCertificateBackground(
						{ ...uploads, certificatePdfTools },
						certificateAssetFolderOf(course.documentId, "background"),
						input,
					),
				);
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

				return ok(
					await exportCertificate(
						issue.design,
						{
							...issue.data,
							verificationUrl: `${appBaseUrl}${verificationPathOf(issue.documentId)}`,
						},
						format,
					),
				);
			});
		},

		async saveDelivery({ documentId, isDownloadable, emailMessage }, actor) {
			return run("saveDelivery", async () => {
				const course = await requireEditableCourse(documentId, actor);

				await certificateRepository.saveDelivery(course.id, {
					isDownloadable,
					emailMessage: emailMessage || null,
				});
				return ok(null);
			});
		},

		async listMine(actor, options) {
			return run("listMine", async () => {
				const rows = await certificateRepository.findMine(
					actor.userId,
					options?.limit,
				);
				return ok(rows.map(toMyCertificate));
			});
		},

		async downloadMine({ documentId, format }, actor) {
			return run("downloadMine", async () => {
				const issue = await certificateRepository.findMyIssue(
					documentId,
					actor.userId,
				);
				if (!issue) throw new CertificateIssueNotFoundError();
				if (!issue.downloadable) throw new CertificateDownloadDisabledError();

				return ok(
					await exportCertificate(
						issue.design,
						{
							...issue.data,
							verificationUrl: `${appBaseUrl}${verificationPathOf(issue.documentId)}`,
						},
						format,
					),
				);
			});
		},

		async verify(issueDocumentId) {
			return run("verify", async () => {
				const issue =
					await certificateRepository.findIssueForVerification(issueDocumentId);
				if (!issue) throw new CertificateIssueNotFoundError();

				return ok(toCertificateVerification(issue));
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
						toSampleRenderData(
							course,
							design.folioFormat,
							clock.now(),
							appBaseUrl,
						),
						format,
					),
				);
			});
		},
	};
};
