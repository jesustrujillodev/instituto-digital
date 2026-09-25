import {
	ArrowDown,
	ArrowUp,
	Check,
	ChevronDown,
	CircleAlert,
	Lock,
	MoreHorizontal,
	Plus,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { RadioGroup as RadioGroupPrimitive, ToggleGroup } from "radix-ui";
import { type RefObject, useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	QUIZ_MAX_QUESTIONS,
	QUIZ_OPTIONS_RANGE,
	QUIZ_POINTS_RANGE,
} from "../domain/content.config";
import {
	FINAL_QUIZ_OWNER,
	type QuizKind,
	type QuizQuestionType,
	quizKindOf,
} from "../domain/quiz.rules";
import type { QuizBank, QuizOwnerRef } from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	quizPath,
} from "../utils/content-form";
import {
	type DraftQuestion,
	emptyOptions,
	emptyQuestion,
	nextKey,
	optionLetter,
	type QuizDraft,
	questionProblemsOf,
	quizPayloadOf,
	quizProblemsOf,
	quizSummaryOf,
	sameQuizDraft,
	toQuizDraft,
	trueFalseOptions,
} from "../utils/quiz-draft";
import { reportSaveFailure } from "../utils/report-save-failure";

const TYPE_LABELS: Record<QuizQuestionType, string> = {
	SINGLE_CHOICE: "Opción única",
	TRUE_FALSE: "Verdadero o falso",
};

/** Cómo se llama cada uso en la pantalla. */
const NOUNS: Record<QuizKind, { name: string; save: string; failed: string }> =
	{
		FINAL: {
			name: "Nombre del examen",
			save: "Guardar examen",
			failed: "Revisa el examen",
		},
		PRACTICE: {
			name: "Nombre del cuestionario",
			save: "Guardar cuestionario",
			failed: "Revisa el cuestionario",
		},
		MODULE: {
			name: "Nombre de la evaluación",
			save: "Guardar evaluación",
			failed: "Revisa la evaluación",
		},
	};

const POINTS_PROBLEM = `Vale de ${QUIZ_POINTS_RANGE.min} a ${QUIZ_POINTS_RANGE.max} puntos`;

const pointsLabel = (points: number) =>
	`${Number.isNaN(points) ? "—" : points} ${points === 1 ? "pt" : "pts"}`;

const numberOrNaN = (value: string) =>
	value === "" ? Number.NaN : Number(value);

/** Lo que quien monta el editor recibe para guardarlo cuando le toca. */
export type QuizSaveRef = RefObject<(() => Promise<boolean>) | null>;

/**
 * El banco de preguntas de un cuestionario: el examen del curso, la práctica
 * de una lección o la evaluación de un módulo. Se guarda entero, y se congela
 * en cuanto alguien lo presenta (docs/adr/0015).
 *
 * Con `saveRef` lo guarda quien lo monta (el wizard, al continuar) y no pinta
 * botón; sin él, lleva el suyo.
 */
export function QuizEditor({
	courseDocumentId,
	owner = FINAL_QUIZ_OWNER,
	bank,
	defaultTitle,
	disabled = false,
	saveRef,
	onDirtyChange,
	onSummaryChange,
}: {
	courseDocumentId: string;
	owner?: QuizOwnerRef;
	bank: QuizBank | null;
	defaultTitle: string;
	disabled?: boolean;
	saveRef?: QuizSaveRef;
	onDirtyChange?: (dirty: boolean) => void;
	/** "5 preguntas · 5 puntos · se aprueba con 4", para el encabezado de afuera. */
	onSummaryChange?: (summary: string | null) => void;
}) {
	const id = useId();
	const nouns = NOUNS[quizKindOf(owner)];
	const [draft, setDraft] = useState<QuizDraft>(() =>
		toQuizDraft(bank, defaultTitle),
	);
	const [baseline, setBaseline] = useState<QuizDraft>(draft);
	// Abre la primera que falte completar: es a donde hay que ir.
	const [openKey, setOpenKey] = useState<string | null>(
		() =>
			draft.questions.find(
				(question) => questionProblemsOf(question).length > 0,
			)?.key ?? null,
	);

	const saver = useFetcherPromise<ContentActionData>();
	useFetcherToast(saver.fetcher);

	const locked = (bank?.attemptCount ?? 0) > 0;
	const busy = saver.fetcher.state !== "idle";
	const dirty = !disabled && !sameQuizDraft(draft, baseline);
	const problems = quizProblemsOf(draft);
	const incomplete = draft.questions.filter(
		(question) => questionProblemsOf(question).length > 0,
	).length;
	const summary = quizSummaryOf(draft);

	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);

	useEffect(() => {
		onSummaryChange?.(summary);
	}, [summary, onSummaryChange]);

	const submit = async (intent: string, payload: unknown, sent: QuizDraft) => {
		const result = await saver.submit(
			{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(payload) },
			{ method: "post", action: quizPath(courseDocumentId) },
		);
		if (!result?.success) return false;
		setBaseline(sent);
		return true;
	};

	/** Guarda lo pendiente. `false` si no se pudo: quien llama no debe seguir. */
	const flush = async () => {
		if (!dirty) return true;
		if (locked) {
			return submit(
				CONTENT_INTENTS.renameQuiz,
				{ ...owner, title: draft.title },
				{ ...baseline, title: draft.title },
			);
		}
		if (problems.length > 0) {
			reportSaveFailure(
				nouns.failed,
				problems.length === 1
					? problems[0]
					: `${problems[0]} Y ${problems.length - 1} más.`,
			);
			return false;
		}
		return submit(CONTENT_INTENTS.saveQuiz, quizPayloadOf(draft, owner), draft);
	};

	// Sin dependencias a propósito: quien guarda siempre usa el borrador actual.
	useEffect(() => {
		if (saveRef) saveRef.current = flush;
	});

	useEffect(() => {
		if (!saveRef) return;
		return () => {
			saveRef.current = null;
			onDirtyChange?.(false);
		};
	}, [saveRef, onDirtyChange]);

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

	const removeQuestion = (key: string) =>
		setDraft((current) => ({
			...current,
			questions: current.questions.filter((question) => question.key !== key),
		}));

	const addQuestion = () => {
		const question = emptyQuestion();
		setDraft((current) => ({
			...current,
			questions: [...current.questions, question],
		}));
		setOpenKey(question.key);
	};

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
						enviados: las preguntas y el porcentaje para aprobar quedaron fijos
						para que todas las notas se midan igual. Solo puedes cambiar el
						nombre.
					</AlertDescription>
				</Alert>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<div className="flex flex-1 flex-col gap-1.5">
						<Label htmlFor={`${id}-title`}>{nouns.name}</Label>
						<Input
							id={`${id}-title`}
							value={draft.title}
							disabled={disabled || busy}
							onChange={(event) =>
								setDraft({ ...draft, title: event.target.value })
							}
						/>
					</div>
					{!saveRef && (
						<Button
							type="button"
							disabled={disabled || busy || !dirty}
							onClick={() => void flush()}
						>
							<Save aria-hidden="true" />
							Guardar nombre
						</Button>
					)}
				</div>
				<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
					{draft.questions.map((question) => (
						<li key={question.key}>
							{question.statement}{" "}
							<span className="text-muted-foreground">
								· {pointsLabel(question.points)}
							</span>
						</li>
					))}
				</ol>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${id}-title`}>{nouns.name}</Label>
					<Input
						id={`${id}-title`}
						value={draft.title}
						disabled={disabled}
						aria-invalid={draft.title.trim() === ""}
						onChange={(event) =>
							setDraft({ ...draft, title: event.target.value })
						}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${id}-passing`}>Para aprobar</Label>
					<div className="relative">
						<Input
							id={`${id}-passing`}
							type="number"
							inputMode="numeric"
							min={0}
							max={100}
							value={Number.isNaN(draft.passingScore) ? "" : draft.passingScore}
							disabled={disabled}
							className="pr-8 tabular-nums"
							onChange={(event) =>
								setDraft({
									...draft,
									passingScore: numberOrNaN(event.target.value),
								})
							}
						/>
						<span
							aria-hidden="true"
							className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm"
						>
							%
						</span>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<Switch
					id={`${id}-shuffle`}
					checked={draft.shuffleQuestions}
					disabled={disabled}
					onCheckedChange={(checked) =>
						setDraft({ ...draft, shuffleQuestions: checked })
					}
				/>
				<Label htmlFor={`${id}-shuffle`} className="font-normal">
					Mostrar las preguntas en distinto orden a cada participante
				</Label>
			</div>

			<section
				className="flex flex-col gap-2"
				aria-labelledby={`${id}-questions`}
			>
				<div className="flex items-center justify-between gap-3">
					<h4 id={`${id}-questions`} className="font-medium text-sm">
						Preguntas
					</h4>
					{incomplete > 0 && (
						<span className="flex items-center gap-1.5 text-warning-foreground text-xs">
							<span
								className="size-2 rounded-full bg-warning-foreground"
								aria-hidden="true"
							/>
							{incomplete === 1
								? "1 pregunta incompleta"
								: `${incomplete} preguntas incompletas`}
						</span>
					)}
				</div>

				{draft.questions.length === 0 ? (
					<p className="rounded-xl border border-border border-dashed px-4 py-5 text-center text-muted-foreground text-sm">
						Todavía sin preguntas.
					</p>
				) : (
					<ol className="flex flex-col gap-2">
						{draft.questions.map((question, index) => (
							<QuestionCard
								key={question.key}
								question={question}
								index={index}
								total={draft.questions.length}
								open={openKey === question.key}
								disabled={disabled}
								onToggle={() =>
									setOpenKey((current) =>
										current === question.key ? null : question.key,
									)
								}
								onChange={(change) => updateQuestion(question.key, change)}
								onMove={(offset) => moveQuestion(index, offset)}
								onRemove={() => removeQuestion(question.key)}
							/>
						))}
					</ol>
				)}

				<Button
					type="button"
					variant="outline"
					className="h-11 w-full rounded-xl"
					disabled={disabled || draft.questions.length >= QUIZ_MAX_QUESTIONS}
					onClick={addQuestion}
				>
					<Plus aria-hidden="true" />
					{draft.questions.length >= QUIZ_MAX_QUESTIONS
						? `Máximo ${QUIZ_MAX_QUESTIONS} preguntas`
						: "Agregar pregunta"}
				</Button>
			</section>

			{!saveRef && (
				<div className="flex flex-wrap items-center justify-end gap-3">
					{dirty && problems.length > 0 && (
						<span className="text-muted-foreground text-xs">
							{problems[0]}
							{problems.length > 1 && ` Y ${problems.length - 1} más.`}
						</span>
					)}
					<Button
						type="button"
						disabled={disabled || busy || !dirty || problems.length > 0}
						onClick={() => void flush()}
					>
						<Save aria-hidden="true" />
						{nouns.save}
					</Button>
				</div>
			)}
		</div>
	);
}

function QuestionCard({
	question,
	index,
	total,
	open,
	disabled,
	onToggle,
	onChange,
	onMove,
	onRemove,
}: {
	question: DraftQuestion;
	index: number;
	total: number;
	open: boolean;
	disabled: boolean;
	onToggle: () => void;
	onChange: (change: Partial<DraftQuestion>) => void;
	onMove: (offset: -1 | 1) => void;
	onRemove: () => void;
}) {
	const id = useId();
	const number = index + 1;
	const problems = questionProblemsOf(question);
	const statement = question.statement.trim();

	const menu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Acciones de la pregunta ${number}`}
					disabled={disabled}
					className="shrink-0 text-muted-foreground"
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
					<ArrowUp aria-hidden="true" />
					Subir
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={index === total - 1}
					onSelect={() => onMove(1)}
				>
					<ArrowDown aria-hidden="true" />
					Bajar
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" onSelect={onRemove}>
					<Trash2 aria-hidden="true" />
					Quitar pregunta
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const badge = (
		<span
			aria-hidden="true"
			className={cn(
				"flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-xs tabular-nums",
				open
					? "bg-primary text-primary-foreground"
					: "bg-muted text-muted-foreground",
			)}
		>
			{number}
		</span>
	);

	if (!open) {
		return (
			<li className="flex items-center gap-2 rounded-xl border border-border bg-card py-2 pr-2 pl-3">
				<button
					type="button"
					aria-expanded={false}
					onClick={onToggle}
					className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
				>
					{badge}
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-sm",
							statement === "" && "text-muted-foreground italic",
						)}
					>
						{statement || "Sin enunciado"}
					</span>
					{problems.length > 0 && (
						<Badge className="shrink-0 border-transparent bg-warning text-warning-foreground">
							Incompleta
						</Badge>
					)}
					<span className="hidden shrink-0 text-muted-foreground text-xs tabular-nums sm:inline">
						{TYPE_LABELS[question.type]} · {pointsLabel(question.points)}
					</span>
				</button>
				{menu}
			</li>
		);
	}

	const correctKey = question.options.find((option) => option.isCorrect)?.key;

	return (
		<li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-3 sm:p-4">
			<div className="flex items-center gap-2">
				<button
					type="button"
					aria-expanded
					onClick={onToggle}
					className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
				>
					{badge}
					<span className="font-medium text-sm">Pregunta {number}</span>
				</button>
				{menu}
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Plegar la pregunta ${number}`}
					onClick={onToggle}
					className="shrink-0 text-muted-foreground"
				>
					<ChevronDown className="rotate-180" aria-hidden="true" />
				</Button>
			</div>

			<div className="flex flex-col gap-4 sm:pl-9">
				<Textarea
					aria-label={`Enunciado de la pregunta ${number}`}
					placeholder="Escribe la pregunta"
					value={question.statement}
					disabled={disabled}
					onChange={(event) => onChange({ statement: event.target.value })}
				/>

				<div className="flex flex-wrap items-center justify-between gap-3">
					<ToggleGroup.Root
						type="single"
						aria-label={`Tipo de la pregunta ${number}`}
						value={question.type}
						disabled={disabled}
						onValueChange={(value) => {
							if (!value) return;
							const type = value as QuizQuestionType;
							onChange({
								type,
								options:
									type === "TRUE_FALSE" ? trueFalseOptions() : emptyOptions(),
							});
						}}
						className="flex gap-0.5 rounded-xl border border-border bg-muted/40 p-1"
					>
						{(Object.keys(TYPE_LABELS) as QuizQuestionType[]).map((type) => (
							<ToggleGroup.Item
								key={type}
								value={type}
								className="h-7 rounded-lg px-2.5 font-medium text-muted-foreground text-xs transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
							>
								{TYPE_LABELS[type]}
							</ToggleGroup.Item>
						))}
					</ToggleGroup.Root>

					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<Label htmlFor={`${id}-points`} className="font-normal">
							Vale
						</Label>
						<Input
							id={`${id}-points`}
							type="number"
							inputMode="numeric"
							min={QUIZ_POINTS_RANGE.min}
							max={QUIZ_POINTS_RANGE.max}
							value={Number.isNaN(question.points) ? "" : question.points}
							disabled={disabled}
							aria-invalid={problems.includes(POINTS_PROBLEM)}
							className="h-8 w-14 text-center tabular-nums"
							onChange={(event) =>
								onChange({ points: numberOrNaN(event.target.value) })
							}
						/>
						<span aria-hidden="true">
							{question.points === 1 ? "punto" : "puntos"}
						</span>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<span id={`${id}-options`} className="text-muted-foreground text-xs">
						Opciones · marca la correcta
					</span>
					<RadioGroupPrimitive.Root
						aria-labelledby={`${id}-options`}
						value={correctKey}
						disabled={disabled}
						onValueChange={(key) =>
							onChange({
								options: question.options.map((option) => ({
									...option,
									isCorrect: option.key === key,
								})),
							})
						}
						className="flex flex-col gap-2"
					>
						{question.options.map((option, position) => {
							const letter = optionLetter(position);
							const correct = option.isCorrect;
							const empty =
								question.type === "SINGLE_CHOICE" && option.text.trim() === "";

							return (
								<div key={option.key} className="flex items-center gap-2">
									<RadioGroupPrimitive.Item
										value={option.key}
										aria-label={`Marcar la opción ${letter} como correcta`}
										className={cn(
											"flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50",
											correct
												? "border-success-foreground bg-success-foreground text-background"
												: "border-input hover:border-foreground/40",
										)}
									>
										<RadioGroupPrimitive.Indicator>
											<Check
												className="size-3.5"
												strokeWidth={3}
												aria-hidden="true"
											/>
										</RadioGroupPrimitive.Indicator>
									</RadioGroupPrimitive.Item>

									<div
										className={cn(
											"flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3",
											correct
												? "border-success-foreground/40 bg-success"
												: empty
													? "border-warning-foreground/40"
													: "border-border",
										)}
									>
										{question.type === "TRUE_FALSE" ? (
											<span className="flex-1 text-sm">{option.text}</span>
										) : (
											<input
												aria-label={`Opción ${letter}`}
												placeholder="Escribe la opción"
												value={option.text}
												disabled={disabled}
												onChange={(event) =>
													onChange({
														options: question.options.map((row) =>
															row.key === option.key
																? { ...row, text: event.target.value }
																: row,
														),
													})
												}
												className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
											/>
										)}
										{correct && (
											<span className="shrink-0 font-medium text-success-foreground text-xs">
												Correcta
											</span>
										)}
									</div>

									{question.type === "SINGLE_CHOICE" && (
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label={`Quitar la opción ${letter}`}
											disabled={
												disabled ||
												question.options.length <= QUIZ_OPTIONS_RANGE.min
											}
											className="shrink-0 text-muted-foreground"
											onClick={() => {
												const options = question.options.filter(
													(row) => row.key !== option.key,
												);
												// Siempre queda una correcta: si se quita, pasa a la primera.
												if (!options.some((row) => row.isCorrect)) {
													options[0] = { ...options[0], isCorrect: true };
												}
												onChange({ options });
											}}
										>
											<X aria-hidden="true" />
										</Button>
									)}
								</div>
							);
						})}
					</RadioGroupPrimitive.Root>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2">
					{question.type === "SINGLE_CHOICE" &&
					question.options.length < QUIZ_OPTIONS_RANGE.max ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={disabled}
							onClick={() =>
								onChange({
									options: [
										...question.options,
										{ key: nextKey(), text: "", isCorrect: false },
									],
								})
							}
						>
							<Plus aria-hidden="true" />
							Agregar opción
						</Button>
					) : (
						<span />
					)}
					{problems.length > 0 && (
						<span className="flex items-center gap-1.5 text-warning-foreground text-xs">
							<CircleAlert className="size-3.5" aria-hidden="true" />
							{problems[0]}
						</span>
					)}
				</div>
			</div>
		</li>
	);
}
