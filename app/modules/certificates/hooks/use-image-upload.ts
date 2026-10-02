import { useCallback, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { UploadedImage } from "../domain/certificate.types";
import {
	CERTIFICATE_INTENTS,
	type CertificateActionData,
	FILE_FIELD,
	INTENT_FIELD,
} from "../utils/certificate-form";
import {
	fittedSizeOf,
	IMAGE_MAX_SIDE_PX,
	SIGNATURE_MAX_SIDE_PX,
} from "../utils/image-size";

const loadImage = (file: File): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("No se pudo leer la imagen"));
		};
		image.src = url;
	});

/**
 * Reduce una imagen grande antes de subirla. Una firma sale en PNG: es trazo
 * fino sobre transparencia y la compresión con pérdida la ensucia en el borde.
 * Un SVG sube tal cual. Si el navegador no puede, sube el original: el
 * servidor valida tipo y tamaño de todas formas.
 */
const prepare = async (file: File, signature: boolean): Promise<File> => {
	if (file.type === "image/svg+xml") return file;
	try {
		const image = await loadImage(file);
		const size = fittedSizeOf(
			image.naturalWidth,
			image.naturalHeight,
			signature ? SIGNATURE_MAX_SIDE_PX : IMAGE_MAX_SIDE_PX,
		);
		const keep =
			!signature &&
			size.width === image.naturalWidth &&
			file.size <= 2 * 1024 * 1024;
		if (keep) return file;

		const canvas = document.createElement("canvas");
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext("2d");
		if (!context) return file;
		context.drawImage(image, 0, 0, size.width, size.height);

		const type =
			signature || file.type === "image/png" ? "image/png" : file.type;
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, type, 0.9),
		);
		if (!blob) return file;
		const extension = blob.type.split("/")[1] ?? "png";
		return new File(
			[blob],
			`${file.name.replace(/\.[^.]+$/, "")}.${extension}`,
			{
				type: blob.type,
			},
		);
	} catch {
		return file;
	}
};

/**
 * Sube una imagen del certificado y avisa con su referencia y medidas. La
 * imagen entra al diseño en el lienzo; a la base, solo cuando se guarda.
 */
export function useImageUpload(
	action: string,
	onUploaded: (image: UploadedImage, signature: boolean) => void,
) {
	const fetcher = useFetcher<CertificateActionData>();
	useFetcherToast(fetcher);
	const signature = useRef(false);
	const handled = useRef<unknown>(null);

	useEffect(() => {
		const result = fetcher.data;
		if (fetcher.state !== "idle" || !result || handled.current === result)
			return;
		handled.current = result;
		if (result.success && result.data && "ref" in result.data) {
			onUploaded(result.data, signature.current);
		}
	}, [fetcher.state, fetcher.data, onUploaded]);

	const upload = useCallback(
		async (file: File, asSignature: boolean) => {
			signature.current = asSignature;
			const form = new FormData();
			form.set(INTENT_FIELD, CERTIFICATE_INTENTS.uploadImage);
			form.set(FILE_FIELD, await prepare(file, asSignature));
			fetcher.submit(form, {
				method: "post",
				action,
				encType: "multipart/form-data",
			});
		},
		[fetcher, action],
	);

	return { upload, pending: fetcher.state !== "idle" };
}
