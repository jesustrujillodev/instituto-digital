import { ArrowDown, ArrowUp, Lock, Plus, Save, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	QUIZ_DEFAULT_PASSING_SCORE,
	QUIZ_MAX_QUESTIONS,
	QUIZ_OPTIONS_RANGE,
	QUIZ_POINTS_RANGE,
	TRUE_FALSE_LABELS,
} from "../domain/content.config";
import type { QuizQuestionType } from "../domain/quiz.rules";
import type { QuizBank } from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	quizPath,
} from "../utils/content-form";

const TYPE_LABELS: Record<QuizQuestionType, string> = {
	SINGLE_CHOICE: "Opción única",
	TRUE_FALSE: "Verdadero o falso",
};

interface DraftOption {
	key: string;
	text: string;
	isCorrect: boolean;
}

interface DraftQuestion {
	key: string;
	statement: string;
	type: QuizQuestionType;
	points: number;
	options: DraftOption[];
}

interface Draft {
	title: string;
	passingScore: number;
	shuffleQuestions: boolean;
	questions: DraftQuestion[];
}

let keySeed = 0;
const nextKey = () => `k${++keySeed}`;

const trueFalseOptions = (correctIndex = 0): DraftOption[] =>
	TRUE_FALSE_LABELS.map((text, index) => ({
		key: nextKey(),
		text,
		isCorrect: index === correctIndex,
	}));

const emptyQuestion = (): DraftQuestion => ({
	key: nextKey(),
	statement: "",
	type: "SINGLE_CHOICE",
	points: 1,
	options: [
		{ key: nextKey(), text: "", isCorrect: true },
		{ key: nextKey(), text: "", isCorrect: false },
	],
});

const toDraft = (bank: QuizBank | null, defaultTitle: string): Draft => ({
	title: bank?.title ?? defaultTitle,
	passingScore: bank?.passingScore ?? QUIZ_DEFAULT_PASSING_SCORE,
	shuffleQuestions: bank?.shuffleQuestions ?? false,
	questions: (bank?.questions ?? []).map((question) => ({
		key: question.documentId,
		statement: question.statement,
		type: question.type,
		points: question.points,
		options: question.options.map((option) => ({
			key: option.documentId,
			text: option.text,
			isCorrect: option.isCorrect,
		})),
	})),
});

/** Lo que el servidor rechazaría, dicho antes de enviar. */
const problemsOf = (draft: Draft): string[] => {
	const problems: string[] = [];
	if (draft.title.trim() === "") problems.push("Escribe el título.");
	if (draft.questions.length === 0)
		problems.push("Agrega al menos una pregunta.");

	draft.questions.forEach((question, index) => {
		const number = index + 1;
		if (question.statement.trim() === "") {
			problems.push(`La pregunta ${number} no tiene enunciado.`);
		}
		if (question.options.some((option) => option.text.trim() === "")) {
			problems.push(`La pregunta ${number} tiene una opción vacía.`);
		}
	});

	return problems;
};

const payloadOf = (draft: Draft, lessonDocumentId: string | null) => ({
	lessonDocumentId,
	title: draft.title,
	passingScore: draft.passingScore,
	shuffleQuestions: draft.shuffleQuestions,
	questions: draft.questions.map((question) => ({
		statement: question.statement,
		type: question.type,
		points: question.points,
		options: question.options.map(({ text, isCorrect }) => ({
			text,
			isCorrect,
		})),
	})),
});

const sameDraft = (a: Draft, b: Draft) =>
	JSON.stringify(payloadOf(a, null)) === JSON.stringify(payloadOf(b, null));

/**
 * El banco de preguntas de un cuestionario: el examen del curso o la práctica
 * de una lección. Guarda el banco entero de una vez, por su cuenta, y se
 * congela en cuanto alguien lo presenta (docs/adr/0015).
 */
export function QuizEditor({
	courseDocumentId,
	lessonDocumentId,
	bank,
	defaultTitle,
	disabled = false,
}: {
	courseDocumentId: string;
	lessonDocumentId: string | null;
	bank: QuizBank | null;
	defaultTitle: string;
	disabled?: boolean;
}) {
	const id = useId();
	const saved = toDraft(bank, defaultTitle);
	const [draft, setDraft] = useState<Draft>(saved);
	const [baseline, setBaseline] = useState<Draft>(saved);

	// Lo enviado pasa a ser lo guardado solo si el servidor lo acepta.
	const sentRef = useRef<Draft | null>(null);
	const fetcher = useFetcher<ContentActionData>();
	useFetcherToast(fetcher, {
		onSuccess: () => {
			if (sentRef.current) setBaseline(sentRef.current);
		},
	});

	const locked = (bank?.attemptCount ?? 0) > 0;
	const busy = fetcher.state !== "idle";
	const dirty = !sameDraft(draft, baseline);
	const problems = problemsOf(draft);

	const send = (intent: string, payload: unknown) => {
		fetcher.submit(
			{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(payload) },
			{ method: "post", action: quizPath(courseDocumentId) },
		);
		sentRef.current = draft;
	};

	const updateQuestion = (key: string, change: Partial<DraftQuestion>) =>
		setDraft((current) => ({
			...current,
			questions: current.questions.map((question) =>
				question.key === key ? { ...question, ...change } : question,
			),
		}));

	const moveQuestion = (index: number, offset: -1 | 1) =>
		setDraft((current) => {
			const questions = [...current.questions];
			const target = index + offset;
			[questions[index], questions[target]] = [
				questions[target] as DraftQuestion,
				questions[index] as DraftQuestion,
			];
			return { ...current, questions };
		});

	if (locked) {
		return (
			<div className="flex flex-col gap-4">
				<Alert>
					<Lock />
					<AlertDescription>
						Ya hay{" "}
						{bank?.attemptCount === 1
							? "1 intento"
							: `${bank?.attemptCount} intentos`}{" "}
						enviados: las preguntas y la calificación mínima quedaron fijas para
						que todas las notas se midan igual. Solo puedes cambiar el título.
					</AlertDescription>
				</Alert>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<div className="flex flex-1 flex-col gap-1.5">
						<Label htmlFor={`${id}-title`}>Título</Label>
						<Input
							id={`${id}-title`}
							value={draft.title}
							disabled={disabled || busy}
							onChange={(event) =>
								setDraft({ ...draft, title: event.target.value })
							}
						/>
					</div>
					<Button
						type="button"
						disabled={disabled || busy || draft.title === baseline.title}
						onClick={() =>
							send(CONTENT_INTENTS.renameQuiz, {
								lessonDocumentId,
								title: draft.title,
							})
						}
					>
						<Save />
						Guardar título
					</Button>
				</div>
				<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
					{draft.questions.map((question) => (
						<li key={question.key}>
							{question.statement}{" "}
							<span className="text-muted-foreground">
								· {question.points} pts
							</span>
						</li>
					))}
				</ol>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${id}-title`}>Título</Label>
					<Input
						id={`${id}-title`}
						value={draft.title}
						disabled={disabled}
						onChange={(event) =>
							setDraft({ ...draft, title: event.target.value })
						}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${id}-passing`}>Calificación mínima (%)</Label>
					<Input
						id={`${id}-passing`}
						type="number"
						min={0}
						max={100}
						value={draft.passingScore}
						disabled={disabled}
						onChange={(event) =>
							setDraft({ ...draft, passingScore: Number(event.target.value) })
						}
					/>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<Checkbox
					id={`${id}-shuffle`}
					checked={draft.shuffleQuestions}
					disabled={disabled}
					onCheckedChange={(checked) =>
						setDraft({ ...draft, shuffleQuestions: checked === true })
					}
				/>
				<Label htmlFor={`${id}-shuffle`} className="font-normal">
					Barajar el orden de las preguntas para cada participante
				</Label>
			</div>

			<ol className="flex flex-col gap-4">
				{draft.questions.map((question, index) => (
					<li
						key={question.key}
						className="flex flex-col gap-3 rounded-md border border-border p-4"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="font-medium text-sm">Pregunta {index + 1}</span>
							<div className="flex gap-1">
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label="Subir pregunta"
									disabled={disabled || index === 0}
									onClick={() => moveQuestion(index, -1)}
								>
									<ArrowUp />
								</Button>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label="Bajar pregunta"
									disabled={disabled || index === draft.questions.length - 1}
									onClick={() => moveQuestion(index, 1)}
								>
									<ArrowDown />
								</Button>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label="Quitar pregunta"
									disabled={disabled}
									onClick={() =>
										setDraft({
											...draft,
											questions: draft.questions.filter(
												(row) => row.key !== question.key,
											),
										})
									}
								>
									<Trash2 />
								</Button>
							</div>
						</div>

						<Textarea
							aria-label={`Enunciado de la pregunta ${index + 1}`}
							placeholder="Escribe la pregunta"
							value={question.statement}
							disabled={disabled}
							onChange={(event) =>
								updateQuestion(question.key, { statement: event.target.value })
							}
						/>

						<div className="grid gap-3 sm:grid-cols-2">
							<Select
								value={question.type}
								disabled={disabled}
								onValueChange={(value) => {
									const type = value as QuizQuestionType;
									updateQuestion(question.key, {
										type,
										options:
											type === "TRUE_FALSE"
												? trueFalseOptions()
												: emptyQuestion().options,
									});
								}}
							>
								<SelectTrigger aria-label="Tipo de pregunta" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(TYPE_LABELS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input
								aria-label="Puntos"
								type="number"
								min={QUIZ_POINTS_RANGE.min}
								max={QUIZ_POINTS_RANGE.max}
								value={question.points}
								disabled={disabled}
								onChange={(event) =>
									updateQuestion(question.key, {
										points: Number(event.target.value),
									})
								}
							/>
						</div>

						<RadioGroup
							aria-label="Respuesta correcta"
							value={question.options.find((option) => option.isCorrect)?.key}
							disabled={disabled}
							onValueChange={(key) =>
								updateQuestion(question.key, {
									options: question.options.map((option) => ({
										...option,
										isCorrect: option.key === key,
									})),
								})
							}
							className="flex flex-col gap-2"
						>
							{question.options.map((option, position) => (
								<div key={option.key} className="flex items-center gap-2">
									<RadioGroupItem
										value={option.key}
										aria-label={`Marcar la opción ${position + 1} como correcta`}
									/>
									{question.type === "TRUE_FALSE" ? (
										<span className="text-sm">{option.text}</span>
									) : (
										<>
											<Input
												aria-label={`Opción ${position + 1}`}
												placeholder={`Opción ${position + 1}`}
												value={option.text}
												disabled={disabled}
												onChange={(event) =>
													updateQuestion(question.key, {
														options: question.options.map((row) =>
															row.key === option.key
																? { ...row, text: event.target.value }
																: row,
														),
													})
												}
											/>
											<Button
												type="button"
												size="icon"
												variant="ghost"
												aria-label={`Quitar la opción ${position + 1}`}
												disabled={
													disabled ||
													question.options.length <= QUIZ_OPTIONS_RANGE.min
												}
												onClick={() => {
													const options = question.options.filter(
														(row) => row.key !== option.key,
													);
													// Siempre queda una correcta: si se quita, pasa a la primera.
													if (!options.some((row) => row.isCorrect)) {
														options[0] = {
															...(options[0] as DraftOption),
															isCorrect: true,
														};
													}
													updateQuestion(question.key, { options });
												}}
											>
												<Trash2 />
											</Button>
										</>
									)}
								</div>
							))}
						</RadioGroup>

						{question.type === "SINGLE_CHOICE" &&
							question.options.length < QUIZ_OPTIONS_RANGE.max && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="self-start"
									disabled={disabled}
									onClick={() =>
										updateQuestion(question.key, {
											options: [
												...question.options,
												{ key: nextKey(), text: "", isCorrect: false },
											],
										})
									}
								>
									<Plus />
									Agregar opción
								</Button>
							)}
					</li>
				))}
			</ol>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<Button
					type="button"
					variant="outline"
					disabled={disabled || draft.questions.length >= QUIZ_MAX_QUESTIONS}
					onClick={() =>
						setDraft({
							...draft,
							questions: [...draft.questions, emptyQuestion()],
						})
					}
				>
					<Plus />
					Agregar pregunta
				</Button>
				<Button
					type="button"
					disabled={disabled || busy || !dirty || problems.length > 0}
					onClick={() =>
						send(CONTENT_INTENTS.saveQuiz, payloadOf(draft, lessonDocumentId))
					}
				>
					<Save />
					Guardar cuestionario
				</Button>
			</div>

			{dirty && problems.length > 0 && (
				<ul className="flex flex-col gap-0.5 text-muted-foreground text-xs">
					{problems.map((problem) => (
						<li key={problem}>{problem}</li>
					))}
				</ul>
			)}
		</div>
	);
}
