import { RotateCcw } from "lucide-react";
import { useFetcher } from "react-router";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { ModuleQuizBoard } from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	retakePath,
} from "../utils/content-form";

/**
 * Cómo le fue a una persona en cada evaluación de módulo, con el botón para
 * habilitarle otro intento cuando reprobó el último (docs/adr/0016).
 */
export function ModuleQuizResults({
	courseDocumentId,
	board,
	userDocumentId,
	personName,
}: {
	courseDocumentId: string;
	board: ModuleQuizBoard;
	userDocumentId: string;
	personName: string;
}) {
	const fetcher = useFetcher<ContentActionData>();
	useFetcherToast(fetcher);
	const busy = fetcher.state !== "idle";

	const attemptOf = new Map(
		board.attempts
			.filter((attempt) => attempt.userDocumentId === userDocumentId)
			.map((attempt) => [attempt.quizDocumentId, attempt]),
	);

	const grantRetake = (moduleDocumentId: string) =>
		fetcher.submit(
			{
				[INTENT_FIELD]: CONTENT_INTENTS.grantRetake,
				[PAYLOAD_FIELD]: JSON.stringify({ moduleDocumentId, userDocumentId }),
			},
			{ method: "post", action: retakePath(courseDocumentId) },
		);

	return (
		<ul className="flex flex-wrap gap-2">
			{board.quizzes.map((quiz) => {
				const attempt = attemptOf.get(quiz.quizDocumentId);
				const retakeable =
					board.canGrantRetake &&
					attempt !== undefined &&
					!attempt.passed &&
					attempt.retakeGrantedAt === null;

				return (
					<li
						key={quiz.quizDocumentId}
						className="flex items-center gap-1.5 text-xs"
					>
						<span className="text-muted-foreground">{quiz.moduleTitle}:</span>
						{!attempt ? (
							<Badge variant="outline">Sin presentar</Badge>
						) : attempt.retakeGrantedAt ? (
							<Badge variant="outline">
								{attempt.score} · otro intento habilitado
							</Badge>
						) : (
							<Badge variant={attempt.passed ? "default" : "destructive"}>
								{attempt.score} · {attempt.passed ? "aprobada" : "no aprobada"}
								{attempt.number > 1 && ` · intento ${attempt.number}`}
							</Badge>
						)}
						{retakeable && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-xs"
								disabled={busy}
								aria-label={`Habilitar otro intento de ${quiz.title} a ${personName}`}
								onClick={() => grantRetake(quiz.moduleDocumentId)}
							>
								<RotateCcw aria-hidden="true" />
								Otro intento
							</Button>
						)}
					</li>
				);
			})}
		</ul>
	);
}
