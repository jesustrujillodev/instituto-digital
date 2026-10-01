import { lazy, Suspense, useId } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type {
	LessonMaterialState,
	MaterialLesson,
} from "../hooks/use-lesson-material";
import { LessonBodyView } from "./lesson-body-view";
import { LessonLinkField } from "./lesson-link-field";
import { LessonFilePreview } from "./lesson-material-view";
import { LessonUploadField } from "./lesson-upload-field";
import { LessonVideoPlayer } from "./lesson-video-player";
import { QuizBankPanel } from "./quiz-bank-panel";

// Tiptap solo lo descarga quien captura, y solo al abrir una lección de texto.
const LessonBodyEditor = lazy(() => import("./lesson-body-editor"));

/**
 * La silueta de lo que va a aparecer, con su forma: el editor, el reproductor o
 * el campo de subida. Lo que carga ocupa el mismo sitio y nada salta al llegar.
 */
function MaterialSkeleton({
	type,
	label,
	className,
}: {
	type: MaterialLesson["type"];
	label: string;
	className?: string;
}) {
	return (
		<div aria-busy="true" className={cn("flex flex-col gap-3", className)}>
			<span className="sr-only">{label}</span>
			{type === "TEXT" ? (
				<>
					<Skeleton className="h-9 w-full rounded-md" />
					<Skeleton className="h-64 w-full rounded-md" />
				</>
			) : type === "LINK" ? (
				<>
					<Skeleton className="h-4 w-32 rounded-md" />
					<Skeleton className="h-9 w-full rounded-md" />
				</>
			) : (
				<>
					{type === "VIDEO" && (
						<Skeleton className="aspect-video w-full rounded-xl" />
					)}
					<Skeleton className="h-20 w-full rounded-xl" />
				</>
			)}
		</div>
	);
}

/**
 * El material de una lección según su tipo.
 *
 * `flush` es la variante del editor de dos paneles: el texto ocupa el área de
 * borde a borde y lo demás lleva su propio margen.
 */
export function LessonMaterialFields({
	courseDocumentId,
	lesson,
	state,
	canWrite,
	variant = "boxed",
}: {
	courseDocumentId: string;
	lesson: MaterialLesson;
	state: LessonMaterialState;
	canWrite: boolean;
	variant?: "boxed" | "flush";
}) {
	const id = useId();
	const inset = variant === "flush" ? "px-4 py-5 sm:px-6" : undefined;
	const { material, busy } = state;

	// El cuestionario tiene su propio banco: no pasa por el material.
	if (lesson.type === "QUIZ") {
		return (
			<div className={inset}>
				<QuizBankPanel
					courseDocumentId={courseDocumentId}
					owner={{
						lessonDocumentId: lesson.documentId,
						moduleDocumentId: null,
						followUpDocumentId: null,
					}}
					defaultTitle={lesson.title}
					canWrite={canWrite}
				/>
			</div>
		);
	}

	if (!material) {
		return (
			<MaterialSkeleton
				type={lesson.type}
				label="Cargando el material…"
				className={inset}
			/>
		);
	}

	const current = material.fileName
		? { fileName: material.fileName, fileSize: material.fileSize }
		: null;

	switch (lesson.type) {
		case "TEXT":
			return canWrite ? (
				<Suspense
					fallback={
						<MaterialSkeleton
							type="TEXT"
							label="Cargando el editor…"
							className={inset}
						/>
					}
				>
					<LessonBodyEditor
						key={lesson.documentId}
						value={state.body}
						onChange={state.setBody}
						disabled={busy}
						variant={variant}
					/>
				</Suspense>
			) : (
				<LessonBodyView body={state.body} className={inset} />
			);

		case "LINK":
			return (
				<div className={inset}>
					<LessonLinkField
						id={`${id}-link`}
						value={state.link}
						onChange={state.setLink}
						disabled={!canWrite || busy}
					/>
				</div>
			);

		case "VIDEO":
			return (
				<div className={cn("flex flex-col gap-4", inset)}>
					{material.fileUrl ? (
						<LessonVideoPlayer
							src={material.fileUrl}
							title={lesson.title}
							mimeType={material.mimeType}
						/>
					) : null}

					{canWrite ? (
						<LessonUploadField
							kind="VIDEO"
							current={current}
							requestTicket={state.requestTicket}
							onUploaded={state.onUploaded}
							disabled={busy}
						/>
					) : null}
				</div>
			);

		case "FILE":
			return (
				<div className={cn("flex flex-col gap-4", inset)}>
					<LessonFilePreview material={material} title={lesson.title} />

					{canWrite ? (
						<LessonUploadField
							kind="FILE"
							current={current}
							requestTicket={state.requestTicket}
							onUploaded={state.onUploaded}
							disabled={busy}
						/>
					) : null}
				</div>
			);

		default: {
			const exhaustive: never = lesson.type;
			return exhaustive;
		}
	}
}
