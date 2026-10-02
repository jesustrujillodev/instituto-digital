import type { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import type { InstitutionalLogo } from "../domain/certificate.types";
import type { ICertificateLogoRepository } from "../domain/certificate-logo.repository";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const LOGO_SELECT = {
	documentId: true,
	name: true,
	storageKey: true,
	contentType: true,
	widthPx: true,
	heightPx: true,
	archivedAt: true,
	createdAt: true,
	previous: { select: { documentId: true } },
} satisfies Prisma.InstitutionalLogoSelect;

const toLogo = ({
	previous,
	...row
}: Prisma.InstitutionalLogoGetPayload<{
	select: typeof LOGO_SELECT;
}>): InstitutionalLogo => ({
	...row,
	previousDocumentId: previous?.documentId ?? null,
});

export const createCertificateLogoRepository = ({
	prisma,
}: Dependencies): ICertificateLogoRepository => ({
	async list() {
		const rows = await prisma.institutionalLogo.findMany({
			orderBy: { createdAt: "desc" },
			select: LOGO_SELECT,
		});
		return rows.map(toLogo);
	},

	async findByDocumentIds(documentIds) {
		if (documentIds.length === 0) return [];
		const rows = await prisma.institutionalLogo.findMany({
			where: { documentId: { in: [...documentIds] } },
			select: LOGO_SELECT,
		});
		return rows.map(toLogo);
	},

	async findByStorageKeys(keys) {
		if (keys.length === 0) return [];
		const rows = await prisma.institutionalLogo.findMany({
			where: { storageKey: { in: [...keys] } },
			select: LOGO_SELECT,
		});
		return rows.map(toLogo);
	},

	async create(logo) {
		return toLogo(
			await prisma.institutionalLogo.create({
				data: logo,
				select: LOGO_SELECT,
			}),
		);
	},

	async replace(previousDocumentId, logo, at) {
		return prisma.$transaction(async (tx) => {
			const previous = await tx.institutionalLogo.update({
				where: { documentId: previousDocumentId },
				data: { archivedAt: at },
				select: { id: true },
			});
			return toLogo(
				await tx.institutionalLogo.create({
					data: { ...logo, previousId: previous.id },
					select: LOGO_SELECT,
				}),
			);
		});
	},

	async setArchived(documentId, archivedAt) {
		await prisma.institutionalLogo.update({
			where: { documentId },
			data: { archivedAt },
		});
	},
});
