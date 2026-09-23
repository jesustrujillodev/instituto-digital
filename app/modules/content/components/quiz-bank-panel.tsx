import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { AppResponse } from "@/shared/response/response.types";
import type { QuizBank, QuizOwnerRef } from "../domain/quiz.types";
import { quizPath } from "../utils/content-form";
import { QuizEditor } from "./quiz-editor";

/**
 * El banco de un cuestionario del temario —la práctica de una lección `QUIZ` o
 * la evaluación de un módulo— dentro de su panel. Se pide al abrir: el árbol no
 * lo carga.
 */
export function QuizBankPanel({
	courseDocumentId,
	owner,
	defaultTitle,
	canWrite,
}: {
	courseDocumentId: string;
	owner: QuizOwnerRef;
	defaultTitle: string;
	canWrite: boolean;
}) {
	const loader = useFetcher<AppResponse<QuizBank | null>>();
	const path = quizPath(courseDocumentId, owner);

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
			owner={owner}
			bank={loader.data.success ? loader.data.data : null}
			defaultTitle={defaultTitle}
			disabled={!canWrite}
		/>
	);
}
