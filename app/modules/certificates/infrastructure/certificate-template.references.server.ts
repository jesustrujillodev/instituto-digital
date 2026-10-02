import type { ICradle } from "@/shared/di/container.types";
import type {
	IObjectReferenceSource,
	ObjectReference,
} from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import {
	CERTIFICATE_TEMPLATE,
	templateOfAssetKey,
} from "../domain/certificate-template.rules";
import {
	storageRefsOf,
	withoutAssetRefs,
} from "../domain/design/design.assets";

type Dependencies = {
	certificateTemplateRepository: ICradle["certificateTemplateRepository"];
};

const ROOT = `${CERTIFICATE_TEMPLATE.prefix}/`;
export const TEMPLATES_PATH = "/dashboard/plantillas-de-certificado";

const keysByTemplate = (keys: readonly string[]) => {
	const grouped = new Map<string, string[]>();
	for (const key of keys) {
		const template = templateOfAssetKey(key);
		if (template)
			grouped.set(template, [...(grouped.get(template) ?? []), key]);
	}
	return grouped;
};

/**
 * Imágenes y fondos de las plantillas. Un curso nunca apunta a ellas (aplicar
 * copia), así que soltarlas solo toca el diseño de la plantilla.
 */
export const createCertificateTemplateReferenceSource = ({
	certificateTemplateRepository,
}: Dependencies): IObjectReferenceSource => ({
	async findByKeys(keys) {
		const grouped = keysByTemplate(keys);
		if (grouped.size === 0) return [];
		const templates = await certificateTemplateRepository.findByDocumentIds([
			...grouped.keys(),
		]);
		return templates.flatMap((template): ObjectReference[] => {
			const used = new Set(storageRefsOf(template.design));
			return (grouped.get(template.documentId) ?? [])
				.filter((key) => used.has(toProxyRef(key)))
				.map((key) => ({
					key,
					owner: "certificate-template",
					label: template.name,
					detail: "Imagen de la plantilla",
					href: `${TEMPLATES_PATH}/${template.documentId}/editor`,
				}));
		});
	},

	async release(keys) {
		const grouped = keysByTemplate(keys);
		const templates = await certificateTemplateRepository.findByDocumentIds([
			...grouped.keys(),
		]);
		let released = 0;
		for (const template of templates) {
			const refs = new Set(
				(grouped.get(template.documentId) ?? []).map(toProxyRef),
			);
			const { design, removed } = withoutAssetRefs(template.design, refs);
			if (removed === 0 || !("version" in design)) continue;
			await certificateTemplateRepository.saveDesign(
				template.documentId,
				design,
				null,
			);
			released += removed;
		}
		return released;
	},

	async describeFolders(prefixes) {
		const root = prefixes.includes(ROOT)
			? [
					{
						prefix: ROOT,
						label: "Plantillas de certificado",
						href: TEMPLATES_PATH,
					},
				]
			: [];
		const folders = new Map(
			prefixes.flatMap((prefix) => {
				const [template, rest] = prefix.slice(ROOT.length).split("/");
				return prefix.startsWith(ROOT) && template && rest === ""
					? [[template, prefix] as const]
					: [];
			}),
		);
		if (folders.size === 0) return root;
		const templates = await certificateTemplateRepository.findByDocumentIds([
			...folders.keys(),
		]);
		return [
			...root,
			...templates.map((template) => ({
				prefix: folders.get(template.documentId) ?? "",
				label: template.name,
				href: `${TEMPLATES_PATH}/${template.documentId}/editor`,
			})),
		];
	},
});
