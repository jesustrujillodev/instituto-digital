import type { ICradle } from "@/shared/di/container.types";
import { JOB_NAMES } from "@/shared/queue/queue.config";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";

type Dependencies = {
	jobDispatcher: ICradle["jobDispatcher"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

/** El bucket y el borrado del material subido: el de las lecciones y el de las sesiones. */
export const createMaterialStorage = ({
	jobDispatcher,
	storageBucket,
	storagePublicBucket,
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
	 * Borra el objeto anterior DESPUÉS de escribir, con reintentos en la cola.
	 *
	 * Un objeto que ya no está no puede tumbar un guardado que ya ocurrió; si el
	 * borrado agota sus intentos queda un huérfano, que el gestor de nube sabe
	 * detectar.
	 */
	const discardObject = async (reference: string | null) => {
		if (!reference || !storageBucket) return;

		const key = getKeyFromUrl(reference);
		if (!key) return;

		await jobDispatcher.dispatch(JOB_NAMES.deleteObject, {
			bucket: requireBucketOf(key),
			key,
		});
	};

	return { requireBucketOf, discardObject };
};
