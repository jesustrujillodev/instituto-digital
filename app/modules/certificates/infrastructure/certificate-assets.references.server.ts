import type { ICradle } from "@/shared/di/container.types";
import type {
	IObjectReferenceSource,
	ObjectReference,
} from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { StorageObjectLockedError } from "@/shared/storage/storage.errors";
import { CERTIFICATE_SIGNATURE } from "../domain/certificate.config";
import type { CertificateRecord } from "../domain/certificate.types";
import {
	CERTIFICATE_ASSETS,
	courseOfCertificateAssetKey,
} from "../domain/certificate-assets.rules";
import { storageRefsOf } from "../domain/design/design.assets";

// ===============================================================
// Imágenes, firmas y fondos de certificados como referencias de storage
// ===============================================================
// No tienen columna propia: viven dentro del diseño (borrador y publicado) y
// en el snapshot de cada emisión. La key lleva el curso, y de ahí se sabe qué
// certificados cargar sin recorrerlos todos. Lo que imprime una emisión queda
// en `asset_refs` y no se suelta: un snapshot emitido no se reescribe.

type Dependencies = {
	certificateRepository: ICradle["certificateRepository"];
};

const ROOTS = [
	{
		prefix: `${CERTIFICATE_SIGNATURE.prefix}/`,
		label: "Firmas de certificados",
	},
	{
		prefix: `${CERTIFICATE_ASSETS.prefix}/`,
		label: "Imágenes de certificados",
	},
];

const refsOf = (record: CertificateRecord): Set<string> =>
	new Set([
		...storageRefsOf(record.draft),
		...(record.published ? storageRefsOf(record.published) : []),
	]);

const keysByCourse = (keys: readonly string[]) => {
	const grouped = new Map<string, string[]>();
	for (const key of keys) {
		const course = courseOfCertificateAssetKey(key);
		if (course) grouped.set(course, [...(grouped.get(course) ?? []), key]);
	}
	return grouped;
};

const isSignatureKey = (key: string) =>
	key.startsWith(`${CERTIFICATE_SIGNATURE.prefix}/`);

const hrefOf = (courseDocumentId: string) =>
	`/dashboard/capacitaciones/${courseDocumentId}/certificado`;

/** El curso de una carpeta `<raíz>/<curso>/`, o null si no es de ese nivel. */
const courseOfFolder = (prefix: string): string | null => {
	for (const root of ROOTS) {
		if (!prefix.startsWith(root.prefix)) continue;
		const [course, rest] = prefix.slice(root.prefix.length).split("/");
		return course && rest === "" ? course : null;
	}
	return null;
};

export const createCertificateAssetReferenceSource = ({
	certificateRepository,
}: Dependencies): IObjectReferenceSource => ({
	async findByKeys(keys) {
		const grouped = keysByCourse(keys);
		if (grouped.size === 0) return [];

		const owners = await certificateRepository.findByCourseDocumentIds([
			...grouped.keys(),
		]);

		return owners.flatMap((owner): ObjectReference[] => {
			const inDesign = refsOf(owner.record);
			const inIssues = new Set(owner.issuedAssetRefs);

			return (grouped.get(owner.courseDocumentId) ?? []).flatMap((key) => {
				const ref = toProxyRef(key);
				if (!inDesign.has(ref) && !inIssues.has(ref)) return [];

				const kind = isSignatureKey(key) ? "Firma" : "Imagen";
				return [
					{
						key,
						owner: "certificate",
						label: owner.courseTitle,
						detail: inDesign.has(ref)
							? `${kind} del certificado`
							: `${kind} de certificados emitidos`,
						href: hrefOf(owner.courseDocumentId),
					},
				];
			});
		});
	},

	/**
	 * Suelta las referencias del diseño. Si alguna la imprime un certificado
	 * emitido, lanza sin soltar nada: borrarla dejaría ese documento incompleto.
	 */
	async release(keys) {
		const grouped = keysByCourse(keys);
		const owners = await certificateRepository.findByCourseDocumentIds([
			...grouped.keys(),
		]);
		const locked = owners.flatMap((owner) => {
			const issued = new Set(owner.issuedAssetRefs);
			return (grouped.get(owner.courseDocumentId) ?? []).filter((key) =>
				issued.has(toProxyRef(key)),
			);
		});
		if (locked.length > 0) throw new StorageObjectLockedError(locked);

		let released = 0;
		for (const [course, courseKeys] of grouped) {
			released += await certificateRepository.removeAssetRefs(
				course,
				courseKeys.map(toProxyRef),
			);
		}
		return released;
	},

	/** Las raíces, y cada carpeta de curso con su título en lugar del uuid. */
	async describeFolders(prefixes) {
		const roots = ROOTS.filter((root) => prefixes.includes(root.prefix));

		const courseFolders = new Map<string, string[]>();
		for (const prefix of prefixes) {
			const course = courseOfFolder(prefix);
			if (course) {
				courseFolders.set(course, [
					...(courseFolders.get(course) ?? []),
					prefix,
				]);
			}
		}
		if (courseFolders.size === 0) return roots;

		const owners = await certificateRepository.findByCourseDocumentIds([
			...courseFolders.keys(),
		]);

		return [
			...roots,
			...owners.flatMap((owner) =>
				(courseFolders.get(owner.courseDocumentId) ?? []).map((prefix) => ({
					prefix,
					label: owner.courseTitle,
					href: hrefOf(owner.courseDocumentId),
				})),
			),
		];
	},
});
