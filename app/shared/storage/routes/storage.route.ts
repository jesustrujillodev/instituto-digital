import { redirect } from "react-router";
import { requireAuth } from "@/shared/auth/require-auth.server";
import { contentTypeForKey } from "../mime";
import { bucketForKey, isPublicKey } from "../storage.policy";
import { getKeyFromUrl } from "../storage.utils";
import type { Route } from "./+types/storage.route";

// Contraparte de getPublicUrl: resuelve `/api/storage?key=...` sirviendo el
// archivo (modo inline) o redirigiendo a una URL firmada temporal (por defecto).
//
// Dos modos:
//   ?inline=true → streaming del archivo por nuestro server (para incrustar
//                  imágenes/PDF). Cap de tamaño para no bufferizar objetos
//                  enormes en memoria.
//   por defecto  → URL firmada (300 s) + redirect: el navegador descarga
//                  directo del proveedor, el archivo no pasa por nuestro server.

// Techo para el modo inline. La defensa principal contra archivos grandes es la
// validación de tamaño en la subida (ver el consumidor); esto es una red de
// seguridad para no cargar en RAM un objeto inesperadamente grande.
const MAX_INLINE_BYTES = 15 * 1024 * 1024; // 15 MB
const SIGNED_URL_TTL_S = 300;

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const { logger, storageProvider, storageBucket, storagePublicBucket } =
		context;

	try {
		const { searchParams } = new URL(request.url);
		const keyParam = searchParams.get("key");
		const urlParam = searchParams.get("url");

		// Resolver la key final: soporta ?key=, ?url= legado, o una key que venga
		// como URL completa del proxy.
		let finalKey = keyParam;
		if (!finalKey && urlParam) {
			finalKey = getKeyFromUrl(urlParam);
		} else if (finalKey?.startsWith("http") || finalKey?.startsWith("/api/")) {
			finalKey = getKeyFromUrl(finalKey);
		}

		if (!finalKey) {
			return new Response("File Key Not Found", { status: 404 });
		}

		if (!storageBucket) {
			logger.error("[storage-proxy] STORAGE_BUCKET_NAME no configurado");
			return new Response("Storage Misconfigured", { status: 500 });
		}

		// El bucket lo decide la key, igual que la visibilidad. El proxy debe
		// seguir sirviendo `media/` aunque viva en el bucket público: en
		// entornos sin dominio configurado es la única vía, y las referencias
		// proxy persistidas en BD siguen siendo válidas con el CDN activo.
		const bucketName = bucketForKey(finalKey, {
			defaultBucket: storageBucket,
			publicBucket: storagePublicBucket,
		});

		// Autorización mixta por prefijo: los objetos privados exigen sesión válida.
		// requireAuth lanza un redirect a /iniciar-sesion si no hay sesión.
		if (!isPublicKey(finalKey)) {
			await requireAuth(request, context);
		}

		const isInline = searchParams.get("inline") === "true";

		if (isInline) {
			const fileBuffer = await storageProvider.getFile(bucketName, finalKey);

			if (fileBuffer.byteLength > MAX_INLINE_BYTES) {
				logger.warn("[storage-proxy] objeto excede el cap inline", {
					key: finalKey,
					bytes: fileBuffer.byteLength,
				});
				return new Response("File Too Large For Inline", { status: 413 });
			}

			return new Response(fileBuffer as unknown as BodyInit, {
				headers: {
					"Content-Type": contentTypeForKey(finalKey),
					"Content-Disposition": "inline",
					"Content-Length": String(fileBuffer.byteLength),
				},
			});
		}

		const signedUrl = await storageProvider.getPresignedUrl(
			bucketName,
			finalKey,
			SIGNED_URL_TTL_S,
		);

		return redirect(signedUrl);
	} catch (error) {
		// Un redirect lanzado por requireAuth es un Response: re-lanzarlo tal cual.
		if (error instanceof Response) throw error;
		logger.error("[storage-proxy] error resolviendo archivo", {
			error: String(error),
		});
		return new Response("Internal Server Error", { status: 500 });
	}
};
