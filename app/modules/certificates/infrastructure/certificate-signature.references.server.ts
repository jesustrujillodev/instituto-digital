import type { ICradle } from "@/shared/di/container.types";
import type {
	IObjectReferenceSource,
	ObjectReference,
} from "@/shared/storage/object-reference.port";
import { toProxyRef } from "@/shared/storage/public-url";
import { StorageObjectLockedError } from "@/shared/storage/storage.errors";
import { CERTIFICATE_SIGNATURE } from "../domain/certificate.config";
import { courseOfSignatureKey } from "../domain/certificate.rules";
import type { CertificateRecord } from "../domain/certificate.types";

// ===============================================================
// Firmas de certificados como referencias de storage
// ===============================================================
// La firma no tiene columna propia: vive dentro del diseño (borrador y
// publicado) y en el snapshot de cada emisión. Por eso la key lleva el curso en
// su segundo segmento, y de ahí se sabe qué certificados cargar sin recorrer
// todos. Una firma que solo imprimen emisiones sigue referenciada: `release`
// la quita del diseño, pero un snapshot emitido no se reescribe.

type Dependencies = {
	certificateRepository: ICradle["certificateRepository"];
};

const ROOT_PREFIX = `${CERTIFICATE_SIGNATURE.prefix}/`;

const signatureRefsOf = (record: CertificateRecord): Set<string> =>
	new Set(
		[...record.draft.signatories, ...(record.published?.signatories ?? [])]
			.map((signatory) => signatory.signatureUrl)
			.filter((ref): ref is string => ref !== null),
	);

/** Keys agrupadas por el curso al que pertenecen; las ajenas se ignoran. */
const keysByCourse = (keys: readonly string[]) => {
	const grouped = new Map<string, string[]>();
	for (const key of keys) {
		const course = courseOfSignatureKey(key);
		if (course) grouped.set(course, [...(grouped.get(course) ?? []), key]);
	}
	return grouped;
};

export const createCertificateSignatureReferenceSource = ({
	certificateRepository,
}: Dependencies): IObjectReferenceSource => ({
	async findByKeys(keys) {
		const grouped = keysByCourse(keys);
		if (grouped.size === 0) return [];

		const owners = await certificateRepository.findByCourseDocumentIds([
			...grouped.keys(),
		]);

		return owners.flatMap((owner): ObjectReference[] => {
			const inDesign = signatureRefsOf(owner.record);
			const inIssues = new Set(owner.issuedSignatureRefs);

			return (grouped.get(owner.courseDocumentId) ?? []).flatMap((key) => {
				const ref = toProxyRef(key);
				if (!inDesign.has(ref) && !inIssues.has(ref)) return [];

				return [
					{
						key,
						owner: "certificate",
						label: owner.courseTitle,
						detail: inDesign.has(ref)
							? "Firma del certificado"
							: "Firma de certificados emitidos",
						href: `/dashboard/cursos/${owner.courseDocumentId}/certificado`,
					},
				];
			});
		});
	},

	/**
	 * Suelta las firmas del diseño. Si alguna la imprime un certificado emitido,
	 * lanza sin soltar nada: borrarla dejaría ese documento sin firma.
	 */
	async release(keys) {
		const grouped = keysByCourse(keys);
		const owners = await certificateRepository.findByCourseDocumentIds([
			...grouped.keys(),
		]);
		const locked = owners.flatMap((owner) => {
			const issued = new Set(owner.issuedSignatureRefs);
			return (grouped.get(owner.courseDocumentId) ?? []).filter((key) =>
				issued.has(toProxyRef(key)),
			);
		});
		if (locked.length > 0) throw new StorageObjectLockedError(locked);

		let released = 0;
		for (const [course, courseKeys] of grouped) {
			released += await certificateRepository.removeSignatureRefs(
				course,
				courseKeys.map(toProxyRef),
			);
		}
		return released;
	},

	/** La raíz, y cada carpeta de curso con su título en lugar del uuid. */
	async describeFolders(prefixes) {
		const root = prefixes.includes(ROOT_PREFIX)
			? [{ prefix: ROOT_PREFIX, label: "Firmas de certificados" }]
			: [];

		const courseFolders = new Map(
			prefixes.flatMap((prefix) => {
				const course = courseOfSignatureKey(`${prefix}x`);
				return course && prefix === `${ROOT_PREFIX}${course}/`
					? [[course, prefix] as const]
					: [];
			}),
		);
		if (courseFolders.size === 0) return root;

		const owners = await certificateRepository.findByCourseDocumentIds([
			...courseFolders.keys(),
		]);

		return [
			...root,
			...owners.map((owner) => ({
				prefix: courseFolders.get(owner.courseDocumentId) ?? "",
				label: owner.courseTitle,
				href: `/dashboard/cursos/${owner.courseDocumentId}/certificado`,
			})),
		];
	},
});
