import { RotateCcw } from "lucide-react";
import { useParams } from "react-router";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Card, CardContent } from "@/shared/components/ui/card";
import { ClassroomStopNav } from "../../../components/classroom-stop-nav";
import { QuizOutcomeView, QuizTaker } from "../../../components/quiz-taker";
import type { Route } from "./+types/index";

export { action } from "./index.action";
export { loader } from "./index.loader";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: data?.data.quiz ? data.data.quiz.title : "Evaluación del módulo",
		},
	];
}

export default function AulaModuleQuizPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { moduleTitle, previous, next, quiz },
	} = loaderData;
	const { documentId = "", moduleDocumentId = "" } = useParams();

	return (
		<Card>
			<CardContent className="flex flex-col gap-6">
				<header className="flex flex-col gap-1">
					<span className="text-muted-foreground text-sm">
						Evaluación del módulo · {moduleTitle}
					</span>
					<h2 className="font-semibold text-xl">
						{quiz?.title ?? "Sin evaluación"}
					</h2>
				</header>

				{!quiz ? (
					<p className="text-muted-foreground text-sm">
						Este módulo todavía no tiene evaluación.
					</p>
				) : quiz.sheet ? (
					<>
						{quiz.outcome && (
							<Alert>
								<RotateCcw />
								<AlertDescription>
									Obtuviste {quiz.outcome.score} en tu intento anterior y el
									mínimo es {quiz.outcome.passingScore}. Quien imparte te
									habilitó otro intento.
								</AlertDescription>
							</Alert>
						)}
						<QuizTaker
							sheet={quiz.sheet}
							owner={{ lessonDocumentId: null, moduleDocumentId }}
						/>
					</>
				) : quiz.outcome ? (
					<>
						<QuizOutcomeView outcome={quiz.outcome} />
						{!quiz.outcome.passed && quiz.availability === "TAKEN" && (
							<p className="text-muted-foreground text-sm">
								Necesitas aprobar esta evaluación para completar el curso. Si
								necesitas otro intento, pídeselo a quien lo imparte.
							</p>
						)}
					</>
				) : (
					<p className="text-muted-foreground text-sm">
						El curso terminó: la evaluación ya no se puede presentar.
					</p>
				)}

				<footer className="border-t pt-4">
					<ClassroomStopNav
						courseDocumentId={documentId}
						previous={previous}
						next={next}
					/>
				</footer>
			</CardContent>
		</Card>
	);
}
