import type { ICradle } from "@/shared/di/container.types";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";

type Dependencies = {
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
	log: ICradle["logger"];
};

/** El bucket y el borrado del material subido: el de las lecciones y el de las sesiones. */
export const createMaterialStorage = ({
	storageProvider,
	storageBucket,
	storagePublicBucket,
	log,
}: Dependencies) => {
	// Error de configuración, no de negocio: sale como UNEXPECTED con su mensaje
	// real, que es lo que necesita quien opera.
	const requireBucketOf = (key: string): string => {
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		return bucketForKey(key, {
			defaultBucket: storageBucket,
			publicBucket: storagePublicBucket,
		});
	};

	/**
	 * Borra el objeto anterior, best-effort y DESPUÉS de escribir.
	 *
	 * Un objeto que ya no está no puede tumbar un guardado que ya ocurrió; si el
	 * borrado falla queda un huérfano, que el gestor de nube sabe detectar.
	 */
	const discardObject = (reference: string | null) => {
		if (!reference || !storageBucket) return;

		const key = getKeyFromUrl(reference);
		if (!key) return;

		void storageProvider
			.deleteFile(requireBucketOf(key), key)
			.catch((error) => {
				log.warn("[content] material anterior no borrado", { key, error });
			});
	};

	return { requireBucketOf, discardObject };
};
