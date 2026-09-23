import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { LessonEmbed, LessonMaterial } from "../domain/content.types";
import { LessonBodyView } from "./lesson-body-view";
import { LessonVideoPlayer } from "./lesson-video-player";

const EMBEDDABLE_IMAGES = ["image/png", "image/jpeg", "image/webp"];

/** Un recurso externo: incrustado si el proveedor se reconoce, enlace si no. */
export function LessonEmbedView({
	embed,
	title,
}: {
	embed: LessonEmbed;
	title: string;
}) {
	return embed.kind === "embed" ? (
		<iframe
			title={title}
			src={embed.src}
			className="aspect-video w-full rounded-md border border-input"
			allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			allowFullScreen
			sandbox="allow-scripts allow-same-origin allow-presentation"
		/>
	) : (
		<a
			href={embed.href}
			target="_blank"
			rel="noreferrer noopener"
			className="inline-flex items-center gap-2 text-primary text-sm underline underline-offset-2"
		>
			<ExternalLink className="size-4" />
			Abrir el recurso
		</a>
	);
}

/** Un adjunto: el PDF y las imágenes se ven en línea; todo se descarga. */
export function LessonFilePreview({
	material,
	title,
}: {
	material: Pick<LessonMaterial, "fileUrl" | "downloadUrl" | "mimeType">;
	title: string;
}) {
	return (
		<>
			{material.fileUrl && material.mimeType === "application/pdf" ? (
				<iframe
					title={title}
					src={material.fileUrl}
					className="h-[28rem] w-full rounded-md border border-input"
				/>
			) : null}

			{material.fileUrl &&
			material.mimeType &&
			EMBEDDABLE_IMAGES.includes(material.mimeType) ? (
				<img
					src={material.fileUrl}
					alt={title}
					className="w-full rounded-md border border-input"
				/>
			) : null}

			{material.downloadUrl ? (
				<Button asChild variant="outline" className="self-start">
					<a href={material.downloadUrl}>
						<Download />
						Descargar material
					</a>
				</Button>
			) : null}
		</>
	);
}

const EMPTY = (
	<p className="text-muted-foreground text-sm">
		Esta lección todavía no tiene material.
	</p>
);

/** El material tal como lo lee quien recorre la lección. */
export function LessonMaterialView({
	material,
	onVideoEnded,
}: {
	material: LessonMaterial;
	onVideoEnded?: () => void;
}) {
	switch (material.type) {
		case "TEXT":
			return material.body ? <LessonBodyView body={material.body} /> : EMPTY;

		case "LINK":
			return material.embed ? (
				<LessonEmbedView embed={material.embed} title={material.title} />
			) : (
				EMPTY
			);

		case "VIDEO":
			return material.fileUrl ? (
				<LessonVideoPlayer
					src={material.fileUrl}
					title={material.title}
					mimeType={material.mimeType}
					onEnded={onVideoEnded}
				/>
			) : (
				EMPTY
			);

		case "FILE":
			return material.fileUrl ? (
				<div className="flex flex-col gap-4">
					<LessonFilePreview material={material} title={material.title} />
				</div>
			) : (
				EMPTY
			);

		// El cuestionario lo pinta el aula, que sabe si ya se presentó.
		case "QUIZ":
			return null;

		default: {
			const exhaustive: never = material.type;
			return exhaustive;
		}
	}
}
