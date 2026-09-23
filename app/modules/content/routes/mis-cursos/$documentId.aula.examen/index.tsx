import { Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Card, CardContent } from "@/shared/components/ui/card";
import { QuizOutcomeView, QuizTaker } from "../../../components/quiz-taker";
import type { Route } from "./+types/index";

export { action } from "./index.action";
export { loader } from "./index.loader";

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data?.data ? data.data.title : "Examen" }];
}

export default function AulaExamenPage({ loaderData }: Route.ComponentProps) {
	const view = loaderData.data;

	return (
		<Card>
			<CardContent className="flex flex-col gap-6">
				<header className="flex flex-col gap-1">
					<span className="text-muted-foreground text-sm">Examen final</span>
					<h2 className="font-semibold text-xl">
						{view?.title ?? "Sin examen"}
					</h2>
				</header>

				{!view ? (
					<p className="text-muted-foreground text-sm">
						Este curso no se evalúa con examen en línea.
					</p>
				) : view.outcome ? (
					<QuizOutcomeView outcome={view.outcome} />
				) : view.availability === "LOCKED_BY_CONTENT" ? (
					<Alert>
						<Lock />
						<AlertDescription>
							El examen se habilita cuando completes todas las lecciones
							obligatorias.
						</AlertDescription>
					</Alert>
				) : view.sheet ? (
					<QuizTaker sheet={view.sheet} lessonDocumentId={null} finalExam />
				) : (
					<p className="text-muted-foreground text-sm">
						El curso terminó: el examen ya no se puede presentar.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
