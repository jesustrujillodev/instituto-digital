import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { AppResponse } from "@/shared/response/response.types";
import type { QuizBank } from "../domain/quiz.types";
import { quizPath } from "../utils/content-form";
import { QuizEditor } from "./quiz-editor";

/**
 * El cuestionario de práctica de una lección `QUIZ`, dentro del panel del
 * temario. El banco se pide al abrir: el árbol no lo carga.
 */
export function LessonQuizPanel({
	courseDocumentId,
	lesson,
	canWrite,
}: {
	courseDocumentId: string;
	lesson: { documentId: string; title: string };
	canWrite: boolean;
}) {
	const loader = useFetcher<AppResponse<QuizBank | null>>();
	const path = quizPath(courseDocumentId, lesson.documentId);

	// biome-ignore lint/correctness/useExhaustiveDependencies: el fetcher cambia de identidad en cada render y reentraría en bucle.
	useEffect(() => {
		loader.load(path);
	}, [path]);

	if (!loader.data) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<Loader2 className="size-4 animate-spin" />
				Cargando el cuestionario…
			</div>
		);
	}

	return (
		<QuizEditor
			courseDocumentId={courseDocumentId}
			lessonDocumentId={lesson.documentId}
			bank={loader.data.success ? loader.data.data : null}
			defaultTitle={lesson.title}
			disabled={!canWrite}
		/>
	);
}
