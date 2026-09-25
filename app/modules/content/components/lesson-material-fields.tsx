import { Loader2 } from "lucide-react";
import { lazy, Suspense, useId } from "react";
import { cn } from "@/lib/utils";
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

function Loading({ label, className }: { label: string; className?: string }) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 text-muted-foreground text-sm",
				className,
			)}
		>
			<Loader2 className="size-4 animate-spin" aria-hidden="true" />
			{label}
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
					}}
					defaultTitle={lesson.title}
					canWrite={canWrite}
				/>
			</div>
		);
	}

	if (!material) {
		return <Loading label="Cargando el material…" className={inset} />;
	}

	const current = material.fileName
		? { fileName: material.fileName, fileSize: material.fileSize }
		: null;

	switch (lesson.type) {
		case "TEXT":
			return canWrite ? (
				<Suspense
					fallback={<Loading label="Cargando el editor…" className={inset} />}
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
