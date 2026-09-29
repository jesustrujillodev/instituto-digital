import type { ICradle } from "@/shared/di/container.types";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import type { ILessonMaterialReader } from "../domain/classroom.service";
import { LESSON_PLAYBACK_TTL_S } from "../domain/content.config";
import type { LessonMaterial } from "../domain/content.types";

type Dependencies = {
	storageProvider: ICradle["storageProvider"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

export const createLessonMaterialReader = ({
	storageProvider,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ILessonMaterialReader => {
	/**
	 * Se firma aquí y en cada carga: la key cruda no viaja al cliente, y el
	 * reproductor recibe una URL que aguanta el video entero sin volver a pasar
	 * por el servidor en cada salto.
	 */
	const signReference = async (reference: string) => {
		const key = getKeyFromUrl(reference);
		if (!key) return null;

		// Error de configuración, no de negocio: sale como UNEXPECTED con su
		// mensaje real, que es lo que necesita quien opera.
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		const bucket = bucketForKey(key, {
			defaultBucket: storageBucket,
			publicBucket: storagePublicBucket,
		});
		const [fileUrl, downloadUrl] = await Promise.all([
			storageProvider.getPresignedUrl(bucket, key, LESSON_PLAYBACK_TTL_S),
			storageProvider.getPresignedUrl(bucket, key, LESSON_PLAYBACK_TTL_S, {
				disposition: "attachment",
			}),
		]);

		return { fileUrl, downloadUrl };
	};

	return {
		async sign(material: LessonMaterial) {
			const signed = material.fileUrl
				? await signReference(material.fileUrl)
				: null;

			return signed ? { ...material, ...signed } : material;
		},
		signReference,
	};
};
