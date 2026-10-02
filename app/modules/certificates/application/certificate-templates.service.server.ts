import type { AuthContext } from "@/modules/auth/domain/auth.types";
import {
	courseScopeWriteWhere,
	resolveCourseScope,
} from "@/modules/courses/domain/course.access";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import {
	CertificateAssetNotOwnedError,
	CertificateCourseNotFoundError,
	CertificateForbiddenError,
	CertificateLogoArchivedError,
	CertificateLogoNotFoundError,
	CertificateNotEditableError,
	CertificateTemplateNotFoundError,
} from "../domain/certificate.errors";
import { canEditCertificate } from "../domain/certificate.rules";
import type {
	CertificateDesignV2,
	CertificateTemplate,
	CertificateTemplateView,
} from "../domain/certificate.types";
import {
	CERTIFICATE_ASSETS,
	certificateAssetFolderOf,
	isOwnCertificateAssetRef,
} from "../domain/certificate-assets.rules";
import {
	canSeeTemplate,
	canWriteTemplate,
	ownershipForNew,
	templateVisibilityOf,
} from "../domain/certificate-template.access";
import {
	isOwnTemplateAssetRef,
	rewriteAssetRefs,
	templateAssetFolderOf,
	withoutSignatures,
} from "../domain/certificate-template.rules";
import type { ICertificateTemplateService } from "../domain/certificate-template.service";
import { logoIdsOf, storageRefsOf } from "../domain/design/design.assets";
import { DEFAULT_CERTIFICATE_DESIGN } from "../domain/design/design.presets";
import { builtinLogoOf } from "../domain/design/logos";
import {
	copyObject,
	storeCertificateBackground,
	storeCertificateImage,
} from "./certificate-uploads.server";

type Dependencies = {
	certificateTemplateRepository: ICradle["certificateTemplateRepository"];
	certificateRepository: ICradle["certificateRepository"];
	certificateLogoRepository: ICradle["certificateLogoRepository"];
	certificatePdfTools: ICradle["certificatePdfTools"];
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

/** La carpeta de destino de un recurso según de dónde viene: imagen o fondo. */
const folderKindOf = (ref: string) =>
	getKeyFromUrl(ref)?.includes(`/${CERTIFICATE_ASSETS.folders.background}/`)
		? "background"
		: "image";

export const createCertificateTemplateService = ({
	certificateTemplateRepository,
	certificateRepository,
	certificateLogoRepository,
	certificatePdfTools,
	storageProvider,
	storageBucket,
	storagePublicBucket,
	clock,
	logger,
}: Dependencies): ICertificateTemplateService => {
	const run = createOperationRunner(
		logger.child({ module: "certificates", feature: "templates" }),
	);
	const uploads = { storageProvider, storageBucket, storagePublicBucket };

	const viewOf = (
		template: CertificateTemplate,
		actor: AuthContext,
	): CertificateTemplateView => ({
		...template,
		canEdit: canWriteTemplate(actor, template),
	});

	/** Fuera de alcance responde igual que inexistente (ADR 0003). */
	const requireVisible = async (documentId: string, actor: AuthContext) => {
		const template =
			await certificateTemplateRepository.findByDocumentId(documentId);
		if (!template || !canSeeTemplate(actor, template)) {
			throw new CertificateTemplateNotFoundError();
		}
		return template;
	};

	const requireWritable = async (documentId: string, actor: AuthContext) => {
		const template = await requireVisible(documentId, actor);
		if (!canWriteTemplate(actor, template))
			throw new CertificateForbiddenError();
		return template;
	};

	/** El curso, si quien pregunta administra su certificado y aún se edita. */
	const requireEditableCourse = async (
		courseDocumentId: string,
		actor: AuthContext,
	) => {
		const where = courseScopeWriteWhere(resolveCourseScope(actor));
		const course = where
			? await certificateRepository.findCourse(courseDocumentId, where)
			: null;
		if (!course) throw new CertificateCourseNotFoundError();
		if (!canEditCertificate(course.status)) {
			throw new CertificateNotEditableError(course.status);
		}
		return course;
	};

	/** Los logos subidos que nombra existen y no están archivados. */
	const assertLogos = async (design: CertificateDesignV2) => {
		const uploaded = logoIdsOf(design).filter((id) => !builtinLogoOf(id));
		if (uploaded.length === 0) return;
		const logos = await certificateLogoRepository.findByDocumentIds(uploaded);
		for (const id of uploaded) {
			const logo = logos.find((candidate) => candidate.documentId === id);
			if (!logo) throw new CertificateLogoNotFoundError();
			if (logo.archivedAt) throw new CertificateLogoArchivedError();
		}
	};

	/** Copia los recursos del diseño a otra carpeta y reescribe sus referencias. */
	const copyAssets = async (
		design: CertificateDesignV2,
		folderOf: (kind: "image" | "background") => string,
	): Promise<CertificateDesignV2> => {
		const refs = storageRefsOf(design);
		const copies = await Promise.all(
			refs.map(
				async (ref) =>
					[
						ref,
						await copyObject(uploads, ref, folderOf(folderKindOf(ref))),
					] as const,
			),
		);
		return rewriteAssetRefs(design, new Map(copies));
	};

	return {
		async list(actor, { includeArchived }) {
			return run("list", async () => {
				const visibility = templateVisibilityOf(actor);
				if (visibility.kind === "none") return ok([]);
				const templates = await certificateTemplateRepository.listVisible(
					visibility,
					includeArchived,
				);
				return ok(
					templates
						.map((template) => viewOf(template, actor))
						.filter((template) => !template.archivedAt || template.canEdit),
				);
			});
		},

		async get(documentId, actor) {
			return run("get", async () =>
				ok(viewOf(await requireVisible(documentId, actor), actor)),
			);
		},

		async create({ name, description }, actor) {
			return run("create", async () => {
				const ownership = ownershipForNew(actor);
				if (!ownership) throw new CertificateForbiddenError();
				const template = await certificateTemplateRepository.create({
					documentId: crypto.randomUUID(),
					name,
					description: description || null,
					...ownership,
					design: DEFAULT_CERTIFICATE_DESIGN,
					createdById: actor.userId,
				});
				return ok(viewOf(template, actor));
			});
		},

		async rename({ documentId, name, description }, actor) {
			return run("rename", async () => {
				await requireWritable(documentId, actor);
				await certificateTemplateRepository.rename(
					documentId,
					name,
					description || null,
					actor.userId,
				);
				return ok(null);
			});
		},

		async saveDesign({ documentId, design }, actor) {
			return run("saveDesign", async () => {
				await requireWritable(documentId, actor);
				for (const ref of storageRefsOf(design)) {
					if (!isOwnTemplateAssetRef(ref, documentId)) {
						throw new CertificateAssetNotOwnedError();
					}
				}
				await assertLogos(design);
				await certificateTemplateRepository.saveDesign(
					documentId,
					withoutSignatures(design),
					actor.userId,
				);
				return ok(null);
			});
		},

		async setArchived(documentId, archived, actor) {
			return run("setArchived", async () => {
				await requireWritable(documentId, actor);
				await certificateTemplateRepository.setArchived(
					documentId,
					archived ? clock.now() : null,
				);
				return ok(null);
			});
		},

		async uploadImage(documentId, file, actor) {
			return run("uploadImage", async () => {
				await requireWritable(documentId, actor);
				return ok(
					await storeCertificateImage(
						uploads,
						templateAssetFolderOf(documentId, "image"),
						file,
					),
				);
			});
		},

		async uploadBackground({ documentId, ...input }, actor) {
			return run("uploadBackground", async () => {
				await requireWritable(documentId, actor);
				return ok(
					await storeCertificateBackground(
						{ ...uploads, certificatePdfTools },
						templateAssetFolderOf(documentId, "background"),
						input,
					),
				);
			});
		},

		async fromCourse({ courseDocumentId, name, description, design }, actor) {
			return run("fromCourse", async () => {
				const ownership = ownershipForNew(actor);
				if (!ownership) throw new CertificateForbiddenError();
				const course = await requireEditableCourse(courseDocumentId, actor);

				const clean = withoutSignatures(design);
				// Solo se copia lo que es del propio curso: de otro modo la petición
				// podría hacer copiar cualquier objeto privado de storage.
				for (const ref of storageRefsOf(clean)) {
					if (!isOwnCertificateAssetRef(ref, course.documentId)) {
						throw new CertificateAssetNotOwnedError();
					}
				}
				await assertLogos(clean);

				const documentId = crypto.randomUUID();
				const template = await certificateTemplateRepository.create({
					documentId,
					name,
					description: description || null,
					...ownership,
					design: await copyAssets(clean, (kind) =>
						templateAssetFolderOf(documentId, kind),
					),
					createdById: actor.userId,
				});
				return ok(viewOf(template, actor));
			});
		},

		async apply({ courseDocumentId, templateDocumentId }, actor) {
			return run("apply", async () => {
				const course = await requireEditableCourse(courseDocumentId, actor);
				const template = await requireVisible(templateDocumentId, actor);
				if (template.archivedAt) throw new CertificateTemplateNotFoundError();

				return ok(
					await copyAssets(template.design, (kind) =>
						certificateAssetFolderOf(course.documentId, kind),
					),
				);
			});
		},
	};
};
