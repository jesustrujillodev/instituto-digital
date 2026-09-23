import { CheckCircle2, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import type { QuizOutcome, QuizSheet } from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/content-form";

/** La nota y qué se acertó. La opción correcta no viaja al cliente (docs/adr/0015). */
export function QuizOutcomeView({ outcome }: { outcome: QuizOutcome }) {
	const correct = outcome.questions.filter(
		(question) => question.correct,
	).length;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<span className="font-semibold text-3xl tabular-nums">
					{outcome.score}
				</span>
				<Badge variant={outcome.passed ? "default" : "outline"}>
					{outcome.passed ? "Aprobado" : "No aprobado"}
				</Badge>
				<span className="text-muted-foreground text-sm">
					Mínimo {outcome.passingScore} · {correct} de{" "}
					{outcome.questions.length} correctas · presentado el{" "}
					{formatZonedDate(new Date(outcome.submittedAt))}
				</span>
			</div>
			<ol className="flex flex-col gap-2">
				{outcome.questions.map((question, index) => (
					<li
						key={question.documentId}
						className="flex items-start gap-2 text-sm"
					>
						{question.correct ? (
							<CheckCircle2
								aria-label="Correcta"
								className="mt-0.5 size-4 shrink-0 text-primary"
							/>
						) : (
							<XCircle
								aria-label="Incorrecta"
								className="mt-0.5 size-4 shrink-0 text-destructive"
							/>
						)}
						<span>
							{index + 1}. {question.statement}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}

/**
 * Presentar un cuestionario: hay que responder todas las preguntas y solo hay
 * un intento, así que enviar pide confirmación.
 */
export function QuizTaker({
	sheet,
	lessonDocumentId,
	finalExam,
}: {
	sheet: QuizSheet;
	lessonDocumentId: string | null;
	finalExam: boolean;
}) {
	const fetcher = useFetcher<AppResponse<QuizOutcome>>();
	useFetcherToast(fetcher);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [confirming, setConfirming] = useState(false);

	const answered = sheet.questions.filter(
		(question) => answers[question.documentId],
	).length;
	const complete = answered === sheet.questions.length;
	const busy = fetcher.state !== "idle";

	const submit = () =>
		fetcher.submit(
			{
				[INTENT_FIELD]: CONTENT_INTENTS.submitQuiz,
				[PAYLOAD_FIELD]: JSON.stringify({
					lessonDocumentId,
					answers: Object.entries(answers).map(
						([questionDocumentId, optionDocumentId]) => ({
							questionDocumentId,
							optionDocumentId,
						}),
					),
				}),
			},
			{ method: "post" },
		);

	return (
		<div className="flex flex-col gap-6">
			<p className="text-muted-foreground text-sm">
				{sheet.questions.length} preguntas · {sheet.totalPoints} puntos ·
				apruebas con {sheet.passingScore}. Tienes un solo intento.
			</p>

			<ol className="flex flex-col gap-5">
				{sheet.questions.map((question, index) => (
					<li key={question.documentId} className="flex flex-col gap-3">
						<p className="font-medium text-sm">
							{index + 1}. {question.statement}{" "}
							<span className="font-normal text-muted-foreground">
								({question.points} {question.points === 1 ? "punto" : "puntos"})
							</span>
						</p>
						<RadioGroup
							aria-label={`Pregunta ${index + 1}`}
							value={answers[question.documentId] ?? ""}
							disabled={busy}
							onValueChange={(optionDocumentId) =>
								setAnswers((current) => ({
									...current,
									[question.documentId]: optionDocumentId,
								}))
							}
						>
							{question.options.map((option) => (
								<div
									key={option.documentId}
									className="flex items-center gap-2"
								>
									<RadioGroupItem
										id={option.documentId}
										value={option.documentId}
									/>
									<Label htmlFor={option.documentId} className="font-normal">
										{option.text}
									</Label>
								</div>
							))}
						</RadioGroup>
					</li>
				))}
			</ol>

			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
				<span className="text-muted-foreground text-sm">
					Respondidas {answered} de {sheet.questions.length}
				</span>
				<Button
					type="button"
					disabled={!complete || busy}
					onClick={() => setConfirming(true)}
				>
					<Send />
					Enviar respuestas
				</Button>
			</div>

			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={finalExam ? "¿Enviar el examen?" : "¿Enviar el cuestionario?"}
				description={
					finalExam
						? "Tienes un solo intento: tu nota será la calificación del curso y no podrás presentarlo de nuevo."
						: "Tienes un solo intento. Al enviarlo, la lección queda completada."
				}
				confirmLabel="Enviar"
				cancelLabel="Revisar"
				onConfirm={() => {
					submit();
					setConfirming(false);
				}}
			/>
		</div>
	);
}
