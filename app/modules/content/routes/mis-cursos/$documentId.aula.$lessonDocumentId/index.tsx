import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useFetcher, useParams } from "react-router";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import { LessonMaterialView } from "../../../components/lesson-material-view";
import { QuizOutcomeView, QuizTaker } from "../../../components/quiz-taker";
import type { ProgressResult } from "../../../domain/classroom.types";
import { LESSON_TYPE_LABELS } from "../../../utils/content-labels";
import type { Route } from "./+types/index";

export { action } from "./index.action";
export { loader } from "./index.loader";

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data ? data.data.lesson.title : "Lección" }];
}

export default function AulaLessonPage({ loaderData }: Route.ComponentProps) {
	const {
		data: {
			lesson,
			material,
			previousLessonDocumentId,
			nextLessonDocumentId,
			readOnly,
			quiz,
		},
	} = loaderData;
	const { documentId } = useParams();
	const lessonPath = (lessonDocumentId: string) =>
		`/dashboard/mis-cursos/${documentId}/aula/${lessonDocumentId}`;

	const opener = useFetcher<AppResponse<ProgressResult>>();
	const completer = useFetcher<AppResponse<ProgressResult>>();
	useFetcherToast(completer);

	// Abrir la lección se registra aquí y no en el loader: precargar el enlace
	// no debe contar como haberla abierto.
	const needsOpening = !readOnly && lesson.status === null;
	const { submit } = opener;
	useEffect(() => {
		if (!needsOpening) return;
		submit({ status: "IN_PROGRESS" }, { method: "post" });
	}, [needsOpening, submit]);

	const completed = lesson.status === "COMPLETED";
	// Un video sin archivo no terminaría nunca: se marca a mano, como el resto.
	const byVideo = lesson.type === "VIDEO" && material.fileUrl !== null;
	// Una práctica con preguntas se completa al enviarla; sin ellas, a mano.
	const byQuiz = lesson.type === "QUIZ" && quiz !== null;
	const completing = completer.state !== "idle";
	const complete = () =>
		completer.submit({ status: "COMPLETED" }, { method: "post" });

	return (
		<Card>
			<CardContent className="flex flex-col gap-6">
				<header className="flex flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">{LESSON_TYPE_LABELS[lesson.type]}</Badge>
						{!lesson.isRequired && <Badge variant="outline">Opcional</Badge>}
						{completed && (
							<Badge>
								<CheckCircle2 aria-hidden="true" />
								Completada
							</Badge>
						)}
						{lesson.estimatedMinutes !== null && (
							<span className="text-muted-foreground text-sm">
								{lesson.estimatedMinutes} min
							</span>
						)}
					</div>
					<h2 className="font-semibold text-xl">{lesson.title}</h2>
				</header>

				{byQuiz &&
					(quiz.outcome ? (
						<QuizOutcomeView outcome={quiz.outcome} />
					) : quiz.sheet ? (
						<QuizTaker
							sheet={quiz.sheet}
							lessonDocumentId={lesson.documentId}
							finalExam={false}
						/>
					) : null)}

				<LessonMaterialView
					material={material}
					// El video se da por visto al terminar: el avance es por clase,
					// no por minutos (docs/adr/0013).
					onVideoEnded={!readOnly && !completed ? complete : undefined}
				/>

				<footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
					<div className="flex gap-2">
						{previousLessonDocumentId && (
							<Button asChild variant="outline">
								<Link to={lessonPath(previousLessonDocumentId)}>
									<ChevronLeft />
									Anterior
								</Link>
							</Button>
						)}
						{nextLessonDocumentId && (
							<Button asChild variant="outline">
								<Link to={lessonPath(nextLessonDocumentId)}>
									Siguiente
									<ChevronRight />
								</Link>
							</Button>
						)}
					</div>

					{!readOnly && !completed && !byVideo && !byQuiz && (
						<Button type="button" disabled={completing} onClick={complete}>
							<CheckCircle2 />
							Marcar como completada
						</Button>
					)}
					{!readOnly && !completed && byVideo && (
						<p className="text-muted-foreground text-sm">
							Se marca completada al terminar el video.
						</p>
					)}
				</footer>
			</CardContent>
		</Card>
	);
}
