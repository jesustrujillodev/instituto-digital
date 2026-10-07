import type { ICradle } from "@/shared/di/container.types";
import { bucketForKey } from "@/shared/storage/storage.policy";
import { getKeyFromUrl } from "@/shared/storage/storage.utils";
import type { SignRequest } from "@/shared/storage/url-signer.port";
import type { ILessonMaterialReader } from "../domain/classroom.service";
import { LESSON_PLAYBACK_URL_POLICY } from "../domain/content.config";
import type { LessonMaterial } from "../domain/content.types";

type Dependencies = {
	urlSigner: ICradle["urlSigner"];
	storageBucket: ICradle["storageBucket"];
	storagePublicBucket: ICradle["storagePublicBucket"];
};

type SignedReference = { fileUrl: string; downloadUrl: string };

export const createLessonMaterialReader = ({
	urlSigner,
	storageBucket,
	storagePublicBucket,
}: Dependencies): ILessonMaterialReader => {
	/**
	 * La key cruda no viaja al cliente, y el reproductor recibe una URL que
	 * aguanta el video entero sin volver a pasar por el servidor en cada salto.
	 * Mientras le quede vida, la misma URL se reutiliza entre cargas.
	 */
	const signReferences = async (references: readonly string[]) => {
		const located = references.flatMap((reference) => {
			const key = getKeyFromUrl(reference);
			return key ? [{ reference, key }] : [];
		});
		const signed = new Map<string, SignedReference | null>(
			references.map((reference) => [reference, null]),
		);
		if (located.length === 0) return signed;

		// Error de configuración, no de negocio: sale como UNEXPECTED con su
		// mensaje real, que es lo que necesita quien opera.
		if (!storageBucket) throw new Error("STORAGE_BUCKET_NAME no configurado");

		const requests = located.flatMap(({ key }): SignRequest[] => {
			const bucket = bucketForKey(key, {
				defaultBucket: storageBucket,
				publicBucket: storagePublicBucket,
			});
			return [
				{
					bucket,
					key,
					disposition: "inline",
					policy: LESSON_PLAYBACK_URL_POLICY,
				},
				{
					bucket,
					key,
					disposition: "attachment",
					policy: LESSON_PLAYBACK_URL_POLICY,
				},
			];
		});
		const urls = await urlSigner.signMany(requests);
		located.forEach(({ reference }, index) => {
			signed.set(reference, {
				fileUrl: urls[index * 2].url,
				downloadUrl: urls[index * 2 + 1].url,
			});
		});
		return signed;
	};

	const signReference = async (reference: string) =>
		(await signReferences([reference])).get(reference) ?? null;

	return {
		async sign(material: LessonMaterial) {
			const signed = material.fileUrl
				? await signReference(material.fileUrl)
				: null;

			return signed ? { ...material, ...signed } : material;
		},
		signReference,
		signReferences,
	};
};
