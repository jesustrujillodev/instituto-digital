import { CheckCircle2, RotateCcw, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import { type QuizKind, quizKindOf } from "../domain/quiz.rules";
import type {
	QuizOutcome,
	QuizOwnerRef,
	QuizSheet,
} from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/content-form";

/** Encima de la hoja cuando se reintenta: cómo le fue y que cuenta la mejor. */
export function QuizRetryNotice({ outcome }: { outcome: QuizOutcome }) {
	return (
		<Alert>
			<RotateCcw />
			<AlertDescription>
				Obtuviste {outcome.score} en tu intento anterior y el mínimo es{" "}
				{outcome.passingScore}. Puedes volver a intentarlo: cuenta tu mejor
				nota.
			</AlertDescription>
		</Alert>
	);
}

/** Bajo el resultado cuando ya no quedan intentos y el curso no se acreditó. */
export function QuizRetakeHint() {
	return (
		<p className="text-muted-foreground text-sm">
			Ya no te quedan intentos. Tu mejor nota cuenta para el promedio de la
			capacitación; si necesitas otro intento, pídeselo a quien imparte la
			capacitación.
		</p>
	);
}

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

const CONFIRM_COPY: Record<QuizKind, { title: string; description: string }> = {
	FINAL: {
		title: "¿Enviar el examen?",
		description:
			"Tu calificación de la capacitación será el promedio de tu mejor nota en este examen y en las demás evaluaciones que cuentan.",
	},
	PRACTICE: {
		title: "¿Enviar el cuestionario?",
		description:
			"Enviarlo completa la lección, apruebes o no, y tu mejor nota cuenta para la calificación de la capacitación.",
	},
	MODULE: {
		title: "¿Enviar la evaluación del módulo?",
		description:
			"Enviarla cuenta para tu avance, apruebes o no, y tu mejor nota entra al promedio de la capacitación.",
	},
	FOLLOW_UP: {
		title: "¿Enviar la evaluación?",
		description:
			"Si la evaluación cuenta para la calificación, tu mejor nota entra al promedio de la capacitación.",
	},
};

/** Cuántos intentos le quedan, contando el que está por enviar. */
const attemptsNote = (attemptsLeft: number | null) => {
	if (attemptsLeft === null)
		return "Si no lo apruebas, puedes volver a intentarlo cuando quieras.";
	if (attemptsLeft <= 1) return "Es tu último intento.";
	return `Te quedan ${attemptsLeft} intentos contando este.`;
};

/**
 * Presentar un cuestionario: hay que responder todas las preguntas y cada envío
 * es un intento, así que enviar pide confirmación.
 */
export function QuizTaker({
	sheet,
	owner,
}: {
	sheet: QuizSheet;
	owner: QuizOwnerRef;
}) {
	const fetcher = useFetcher<AppResponse<QuizOutcome>>();
	useFetcherToast(fetcher);
	const copy = CONFIRM_COPY[quizKindOf(owner)];
	const attempts = attemptsNote(sheet.attemptsLeft);
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
					...owner,
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
				apruebas con {sheet.passingScore}. {attempts}
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
					disabled={!complete}
					pending={busy}
					onClick={() => setConfirming(true)}
				>
					<Send />
					Enviar respuestas
				</Button>
			</div>

			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={copy.title}
				description={`${copy.description} ${attempts}`}
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
