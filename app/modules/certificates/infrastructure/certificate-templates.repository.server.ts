import type { Prisma } from "@prisma/client";
import * as v from "valibot";
import type { ICradle } from "@/shared/di/container.types";
import type { CertificateTemplate } from "../domain/certificate.types";
import type { ICertificateTemplateRepository } from "../domain/certificate-template.repository";
import { storedDesignRefsOf } from "../domain/design/design.assets";
import { DEFAULT_CERTIFICATE_DESIGN } from "../domain/design/design.presets";
import { designV2Schema } from "../domain/design/design-v2.schema";

type Dependencies = {
	prisma: ICradle["prisma"];
	logger: ICradle["logger"];
};

const TEMPLATE_SELECT = {
	documentId: true,
	name: true,
	description: true,
	scope: true,
	dependencyId: true,
	dependency: { select: { name: true } },
	design: true,
	archivedAt: true,
	updatedAt: true,
} satisfies Prisma.CertificateTemplateSelect;

type Row = Prisma.CertificateTemplateGetPayload<{
	select: typeof TEMPLATE_SELECT;
}>;

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const readDesign = (blob: unknown) => {
	const parsed = v.safeParse(designV2Schema, blob);
	return parsed.success ? parsed.output : null;
};

export const createCertificateTemplateRepository = ({
	prisma,
	logger,
}: Dependencies): ICertificateTemplateRepository => {
	const log = logger.child({ module: "certificates", layer: "templates" });

	/** Igual que el diseño de un curso: un blob ilegible no tumba la biblioteca. */
	const toTemplate = ({
		dependency,
		design,
		...row
	}: Row): CertificateTemplate => {
		const parsed = readDesign(design);
		if (!parsed) {
			log.error("template design is unreadable — falling back to default", {
				template: row.documentId,
			});
		}
		return {
			...row,
			dependencyName: dependency?.name ?? null,
			design: parsed ?? DEFAULT_CERTIFICATE_DESIGN,
		};
	};

	return {
		async listVisible(visibility, includeArchived) {
			const rows = await prisma.certificateTemplate.findMany({
				where: {
					...(visibility.kind === "dependency" && {
						OR: [
							{ scope: "INSTITUTIONAL" },
							{ scope: "DEPENDENCY", dependencyId: visibility.dependencyId },
						],
					}),
					...(!includeArchived && { archivedAt: null }),
				},
				orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
				select: TEMPLATE_SELECT,
			});
			return rows.map(toTemplate);
		},

		async findByDocumentId(documentId) {
			const row = await prisma.certificateTemplate.findUnique({
				where: { documentId },
				select: TEMPLATE_SELECT,
			});
			return row ? toTemplate(row) : null;
		},

		async findByDocumentIds(documentIds) {
			if (documentIds.length === 0) return [];
			const rows = await prisma.certificateTemplate.findMany({
				where: { documentId: { in: [...documentIds] } },
				select: TEMPLATE_SELECT,
			});
			return rows.map(toTemplate);
		},

		async findWithStorageRefs(documentIds) {
			if (documentIds.length === 0) return [];
			const rows = await prisma.certificateTemplate.findMany({
				where: { documentId: { in: [...documentIds] } },
				select: TEMPLATE_SELECT,
			});
			return rows.map((row) => ({
				template: toTemplate(row),
				...storedDesignRefsOf([row.design], readDesign),
			}));
		},

		async create({ design, ...template }) {
			return toTemplate(
				await prisma.certificateTemplate.create({
					data: { ...template, design: asJson(design) },
					select: TEMPLATE_SELECT,
				}),
			);
		},

		async saveDesign(documentId, design, updatedById) {
			await prisma.certificateTemplate.update({
				where: { documentId },
				data: {
					design: asJson(design),
					...(updatedById !== null && { updatedById }),
				},
			});
		},

		async rename(documentId, name, description, updatedById) {
			await prisma.certificateTemplate.update({
				where: { documentId },
				data: { name, description, updatedById },
			});
		},

		async setArchived(documentId, archivedAt) {
			await prisma.certificateTemplate.update({
				where: { documentId },
				data: { archivedAt },
			});
		},
	};
};
