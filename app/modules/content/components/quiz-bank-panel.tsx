import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Skeleton } from "@/shared/components/ui/skeleton";
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

	if (!loader.data) return <QuizEditorSkeleton />;

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

/** La silueta del editor: datos del cuestionario y un par de preguntas. */
function QuizEditorSkeleton() {
	return (
		<div aria-busy="true" className="flex flex-col gap-5">
			<span className="sr-only">Cargando el cuestionario…</span>
			<div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
				{["w-24", "w-20", "w-16"].map((width) => (
					<div key={width} className="flex flex-col gap-1.5">
						<Skeleton className={`h-4 rounded-md ${width}`} />
						<Skeleton className="h-9 w-full rounded-md" />
					</div>
				))}
			</div>
			<Skeleton className="h-5 w-48 rounded-md" />
			{["first", "second"].map((key) => (
				<Skeleton key={key} className="h-32 w-full rounded-xl" />
			))}
		</div>
	);
}
