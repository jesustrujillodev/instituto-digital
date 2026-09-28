import { RotateCcw } from "lucide-react";
import { useFetcher } from "react-router";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { canGrantRetakeOn } from "../domain/quiz.rules";
import type {
	QuizAttemptRow,
	QuizBoard,
	QuizBoardEntry,
} from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	retakePath,
} from "../utils/content-form";

const labelOf = (quiz: QuizBoardEntry) =>
	quiz.kind === "FINAL" ? "Examen final" : (quiz.ownerTitle ?? quiz.title);

const attemptLabel = (attempt: QuizAttemptRow) =>
	attempt.maxAttempts === null
		? `intento ${attempt.number}`
		: `intento ${attempt.number} de ${attempt.maxAttempts}`;

/**
 * Cómo le fue a una persona en cada cuestionario del curso, con el botón para
 * habilitarle otro intento cuando reprobó el último y agotó los suyos, mientras
 * no haya acreditado (docs/adr/0016, 0024).
 */
export function QuizResults({
	courseDocumentId,
	board,
	userDocumentId,
	personName,
	accredited,
}: {
	courseDocumentId: string;
	board: QuizBoard;
	userDocumentId: string;
	personName: string;
	accredited: boolean;
}) {
	const fetcher = useFetcher<ContentActionData>();
	useFetcherToast(fetcher);
	const busy = fetcher.state !== "idle";

	const attemptOf = new Map(
		board.attempts
			.filter((attempt) => attempt.userDocumentId === userDocumentId)
			.map((attempt) => [attempt.quizDocumentId, attempt]),
	);

	const grantRetake = (quiz: QuizBoardEntry) =>
		fetcher.submit(
			{
				[INTENT_FIELD]: CONTENT_INTENTS.grantRetake,
				[PAYLOAD_FIELD]: JSON.stringify({ ...quiz.owner, userDocumentId }),
			},
			{ method: "post", action: retakePath(courseDocumentId) },
		);

	return (
		<ul className="flex flex-wrap gap-2">
			{board.quizzes.map((quiz) => {
				const attempt = attemptOf.get(quiz.quizDocumentId);
				const retakeable =
					board.canGrantRetake &&
					!accredited &&
					canGrantRetakeOn(attempt ?? null, quiz.maxAttempts);

				return (
					<li
						key={quiz.quizDocumentId}
						className="flex items-center gap-1.5 text-xs"
					>
						<span className="text-muted-foreground">{labelOf(quiz)}:</span>
						{!attempt ? (
							<Badge variant="outline">Sin presentar</Badge>
						) : attempt.retakeGrantedAt ? (
							<Badge variant="outline">
								{attempt.score} · otro intento habilitado
							</Badge>
						) : (
							<Badge variant={attempt.passed ? "default" : "destructive"}>
								{attempt.score} · {attempt.passed ? "aprobada" : "no aprobada"}{" "}
								· {attemptLabel(attempt)}
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
								onClick={() => grantRetake(quiz)}
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
