import type { ICradle } from "@/shared/di/container.types";
import type { IObjectReferenceSource } from "@/shared/storage/object-reference.port";
import { StorageObjectLockedError } from "@/shared/storage/storage.errors";
import { INSTITUTIONAL_LOGO } from "../domain/certificate-logo.rules";

type Dependencies = {
	certificateLogoRepository: ICradle["certificateLogoRepository"];
};

const ROOT = `${INSTITUTIONAL_LOGO.prefix}/`;
export const LOGOS_ADMIN_PATH = "/dashboard/logos-institucionales";

/**
 * Los logos institucionales en storage. Un logo con fila no se suelta nunca:
 * los certificados emitidos lo nombran por su id y se dejarían de pintar.
 */
export const createCertificateLogoReferenceSource = ({
	certificateLogoRepository,
}: Dependencies): IObjectReferenceSource => ({
	async findByKeys(keys) {
		const own = keys.filter((key) => key.startsWith(ROOT));
		const logos = await certificateLogoRepository.findByStorageKeys(own);
		return logos.map((logo) => ({
			key: logo.storageKey,
			owner: "institutional-logo",
			label: logo.name,
			detail: logo.archivedAt ? "Logo archivado" : "Logo institucional",
			href: LOGOS_ADMIN_PATH,
		}));
	},

	async release(keys) {
		const logos = await certificateLogoRepository.findByStorageKeys(
			keys.filter((key) => key.startsWith(ROOT)),
		);
		if (logos.length > 0) {
			throw new StorageObjectLockedError(logos.map((logo) => logo.storageKey));
		}
		return 0;
	},

	async describeFolders(prefixes) {
		return prefixes.includes(ROOT)
			? [
					{
						prefix: ROOT,
						label: "Logos institucionales",
						href: LOGOS_ADMIN_PATH,
					},
				]
			: [];
	},
});
