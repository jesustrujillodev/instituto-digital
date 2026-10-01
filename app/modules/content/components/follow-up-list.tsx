import {
	ChevronDown,
	ClipboardCheck,
	MoreHorizontal,
	Plus,
	Settings2,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "@/lib/utils";
import {
	type SessionRefs,
	sessionLabel,
	sessionNumberLabel,
} from "@/modules/courses/utils/session-label";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
import { Switch } from "@/shared/components/ui/switch";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import {
	FOLLOW_UPS_PER_COURSE_LIMIT,
	QUIZ_DEFAULT_PASSING_SCORE,
} from "../domain/content.config";
import {
	type FollowUpAvailabilityMode,
	followUpOwnerOf,
} from "../domain/quiz.rules";
import type { FollowUpView, QuizBank } from "../domain/quiz.types";
import {
	CONTENT_INTENTS,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	quizPath,
} from "../utils/content-form";
import { AttemptsPicker, QuizEditor, type QuizSaveRef } from "./quiz-editor";

const AVAILABILITY_OPTIONS: {
	value: FollowUpAvailabilityMode;
	label: string;
	description: string;
}[] = [
	{
		value: "SESSION_START",
		label: "Al iniciar la sesión",
		description: "Abierta de principio a fin de la sesión.",
	},
	{
		value: "SESSION_END",
		label: "Al terminar la sesión",
		description:
			"Se abre al terminar y queda abierta los minutos que indiques.",
	},
	{
		value: "RANGE",
		label: "En un rango",
		description:
			"Desde unos minutos antes del inicio hasta unos después del fin.",
	},
	{
		value: "MANUAL",
		label: "Manual",
		description: "Quien imparte la abre y la cierra desde Impartición.",
	},
];

/** «al iniciar la sesión», para el subtítulo de cada tarjeta. */
export const AVAILABILITY_SHORT: Record<FollowUpAvailabilityMode, string> = {
	SESSION_START: "al iniciar la sesión",
	SESSION_END: "al terminar la sesión",
	RANGE: "en un rango",
	MANUAL: "se abre a mano",
};

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

/** «Sesión 2 · 5 preguntas · se aprueba con 60 % · al iniciar la sesión». */
const subtitleOf = (followUp: FollowUpView, sessions: SessionRefs) =>
	[
		sessionNumberLabel(sessions, followUp.sessionDocumentId),
		followUp.questionCount === 0
			? "sin preguntas"
			: plural(followUp.questionCount, "pregunta", "preguntas"),
		`se aprueba con ${followUp.passingScore} %`,
		AVAILABILITY_SHORT[followUp.availability],
	]
		.filter(Boolean)
		.join(" · ");

type Editing = { mode: "new" } | { mode: "edit"; documentId: string };

/**
 * Las evaluaciones de seguimiento de una capacitación calendarizada
 * (docs/adr/0027). Su configuración se guarda desde un modal; sus preguntas se
 * editan aquí mismo y se guardan con el paso, como las del examen final.
 */
export function FollowUpList({
	courseDocumentId,
	followUps,
	banks,
	sessions,
	saveRef,
	onDirtyChange,
}: {
	courseDocumentId: string;
	followUps: readonly FollowUpView[];
	/** El banco de cada una, por `documentId`. */
	banks: Readonly<Record<string, QuizBank | null>>;
	sessions: SessionRefs;
	/** Guarda las preguntas de todas al continuar el paso. */
	saveRef: QuizSaveRef;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const id = useId();
	const remover = useFetcher<AppResponse<null>>();
	useFetcherToast(remover);

	const defined = followUps.length > 0;
	// No se guarda: tener evaluaciones definidas es lo que lo deja encendido.
	const [enabled, setEnabled] = useState(defined);
	const [editing, setEditing] = useState<Editing | null>(null);
	const [removing, setRemoving] = useState<FollowUpView | null>(null);
	// Se abren solas las que todavía no tienen preguntas: es lo que falta.
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() =>
			new Set(
				followUps
					.filter((followUp) => followUp.questionCount === 0)
					.map((followUp) => followUp.documentId),
			),
	);

	const editors = useRef(new Map<string, QuizSaveRef>());
	const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());

	useEffect(() => {
		onDirtyChange(dirtyIds.size > 0);
	}, [dirtyIds, onDirtyChange]);

	useEffect(() => {
		saveRef.current = async () => {
			for (const editor of editors.current.values()) {
				const save = editor.current;
				if (save && !(await save())) return false;
			}
			return true;
		};
		return () => {
			saveRef.current = null;
		};
	}, [saveRef]);

	const register = useCallback((documentId: string, editor: QuizSaveRef) => {
		editors.current.set(documentId, editor);
		return () => {
			editors.current.delete(documentId);
		};
	}, []);

	const markDirty = useCallback((documentId: string, dirty: boolean) => {
		setDirtyIds((previous) => {
			if (previous.has(documentId) === dirty) return previous;
			const next = new Set(previous);
			if (dirty) next.add(documentId);
			else next.delete(documentId);
			return next;
		});
	}, []);

	const toggle = (documentId: string) =>
		setExpanded((previous) => {
			const next = new Set(previous);
			if (next.has(documentId)) next.delete(documentId);
			else next.add(documentId);
			return next;
		});

	const on = enabled || defined;
	const canAdd = followUps.length < FOLLOW_UPS_PER_COURSE_LIMIT;
	const current =
		editing?.mode === "edit"
			? (followUps.find((row) => row.documentId === editing.documentId) ?? null)
			: null;

	return (
		<section className="flex flex-col gap-3" aria-labelledby={`${id}-title`}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-0.5">
					<h3 id={`${id}-title`} className="font-bold text-lg">
						Evaluaciones de seguimiento{" "}
						<span className="font-normal text-muted-foreground text-sm">
							· opcional
						</span>
					</h3>
					<p className="text-muted-foreground text-sm">
						Exámenes en línea durante las sesiones. No son requisito; las que
						cuentan entran al promedio, y quien no las presenta saca 0.
					</p>
					{defined && (
						<p className="text-muted-foreground text-xs">
							Para apagarlo, elimina las que hay.
						</p>
					)}
				</div>
				<Switch
					aria-labelledby={`${id}-title`}
					checked={on}
					disabled={defined}
					onCheckedChange={setEnabled}
				/>
			</div>

			{on &&
				(sessions.length === 0 ? (
					<p className="rounded-xl border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
						Agrega y guarda las sesiones en el paso Programa para ligarles
						evaluaciones.
					</p>
				) : (
					<ul className="flex flex-col gap-3">
						{followUps.map((followUp) => (
							<FollowUpCard
								key={followUp.documentId}
								courseDocumentId={courseDocumentId}
								followUp={followUp}
								bank={banks[followUp.documentId] ?? null}
								sessions={sessions}
								expanded={expanded.has(followUp.documentId)}
								onToggle={() => toggle(followUp.documentId)}
								onEdit={() =>
									setEditing({
										mode: "edit",
										documentId: followUp.documentId,
									})
								}
								onRemove={() => setRemoving(followUp)}
								register={register}
								onDirty={markDirty}
							/>
						))}
						<li>
							<button
								type="button"
								disabled={!canAdd}
								onClick={() => setEditing({ mode: "new" })}
								className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 font-medium text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"
							>
								<Plus className="size-4" aria-hidden="true" />
								{canAdd
									? "Agregar evaluación de seguimiento"
									: `Máximo ${FOLLOW_UPS_PER_COURSE_LIMIT} evaluaciones`}
							</button>
						</li>
					</ul>
				))}

			<FollowUpDialog
				open={editing !== null}
				onOpenChange={(open) => !open && setEditing(null)}
				courseDocumentId={courseDocumentId}
				followUp={current}
				sessions={sessions}
				onSaved={(documentId) => {
					setEditing(null);
					setExpanded((previous) => new Set(previous).add(documentId));
				}}
			/>

			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => !open && setRemoving(null)}
				title={`¿Eliminar ${removing?.title ?? "la evaluación"}?`}
				description="Se borra junto con sus preguntas. No afecta a la asistencia."
				confirmLabel="Eliminar"
				destructive
				onConfirm={() => {
					if (removing) {
						remover.submit(
							{
								[INTENT_FIELD]: CONTENT_INTENTS.removeFollowUp,
								[PAYLOAD_FIELD]: JSON.stringify({
									followUpDocumentId: removing.documentId,
								}),
							},
							{ method: "post", action: quizPath(courseDocumentId) },
						);
					}
					setRemoving(null);
				}}
			/>
		</section>
	);
}

/**
 * Una evaluación: su encabezado y, plegable, el editor de sus preguntas. El
 * editor sigue montado aunque se pliegue: plegar no puede perder lo escrito.
 */
function FollowUpCard({
	courseDocumentId,
	followUp,
	bank,
	sessions,
	expanded,
	onToggle,
	onEdit,
	onRemove,
	register,
	onDirty,
}: {
	courseDocumentId: string;
	followUp: FollowUpView;
	bank: QuizBank | null;
	sessions: SessionRefs;
	expanded: boolean;
	onToggle: () => void;
	onEdit: () => void;
	onRemove: () => void;
	register: (documentId: string, editor: QuizSaveRef) => () => void;
	onDirty: (documentId: string, dirty: boolean) => void;
}) {
	const bodyId = useId();
	const saveRef: QuizSaveRef = useRef(null);
	const { documentId } = followUp;

	useEffect(() => register(documentId, saveRef), [register, documentId]);

	const onDirtyChange = useCallback(
		(dirty: boolean) => onDirty(documentId, dirty),
		[onDirty, documentId],
	);

	return (
		<li className="rounded-xl border border-border bg-card">
			<div className="flex items-center gap-3 px-4 py-3">
				<button
					type="button"
					aria-expanded={expanded}
					aria-controls={bodyId}
					onClick={onToggle}
					className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
				>
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground">
						<ClipboardCheck className="size-4" aria-hidden="true" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium text-sm">
							{followUp.title}
						</span>
						<span className="block truncate text-muted-foreground text-xs">
							{subtitleOf(followUp, sessions)}
						</span>
					</span>
					<ChevronDown
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform",
							expanded && "rotate-180",
						)}
						aria-hidden="true"
					/>
				</button>
				<Badge
					variant={followUp.countsTowardGrade ? "secondary" : "outline"}
					className={cn(
						"hidden sm:inline-flex",
						followUp.countsTowardGrade && "bg-success text-success-foreground",
					)}
				>
					{followUp.countsTowardGrade
						? "Cuenta para la calificación"
						: "No cuenta"}
				</Badge>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Configurar ${followUp.title}`}
					onClick={onEdit}
				>
					<Settings2 aria-hidden="true" />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Más acciones de ${followUp.title}`}
						>
							<MoreHorizontal aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={onEdit}>Configurar</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							disabled={followUp.attemptCount > 0}
							onSelect={onRemove}
						>
							Eliminar
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<div
				id={bodyId}
				hidden={!expanded}
				className="border-border border-t px-4 py-4"
			>
				<QuizEditor
					courseDocumentId={courseDocumentId}
					owner={followUpOwnerOf(documentId)}
					bank={bank}
					defaultTitle={followUp.title}
					saveRef={saveRef}
					onDirtyChange={onDirtyChange}
					questionsOnly
				/>
			</div>
		</li>
	);
}

interface SettingsDraft {
	title: string;
	sessionDocumentId: string;
	countsTowardGrade: boolean;
	availability: FollowUpAvailabilityMode;
	opensBeforeMinutes: string;
	closesAfterMinutes: string;
	passingScore: string;
	maxAttempts: number | null;
	shuffleQuestions: boolean;
}

const draftOf = (
	followUp: FollowUpView | null,
	sessions: SessionRefs,
): SettingsDraft => ({
	title: followUp?.title ?? "",
	sessionDocumentId:
		followUp?.sessionDocumentId ?? sessions.at(0)?.documentId ?? "",
	countsTowardGrade: followUp?.countsTowardGrade ?? true,
	availability: followUp?.availability ?? "SESSION_START",
	opensBeforeMinutes: String(followUp?.opensBeforeMinutes ?? 15),
	closesAfterMinutes: String(followUp?.closesAfterMinutes ?? 30),
	passingScore: String(followUp?.passingScore ?? QUIZ_DEFAULT_PASSING_SCORE),
	maxAttempts: followUp ? followUp.maxAttempts : 1,
	shuffleQuestions: followUp?.shuffleQuestions ?? false,
});

const numberOrNull = (value: string) =>
	value.trim() === "" ? null : Number(value);

/**
 * La configuración de una evaluación de seguimiento: todo menos las preguntas.
 * Se guarda al aceptar; las preguntas, con el paso.
 */
function FollowUpDialog({
	open,
	onOpenChange,
	courseDocumentId,
	followUp,
	sessions,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	courseDocumentId: string;
	followUp: FollowUpView | null;
	sessions: SessionRefs;
	onSaved: (documentId: string) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{followUp
							? "Configurar evaluación"
							: "Nueva evaluación de seguimiento"}
					</DialogTitle>
					<DialogDescription>
						Sus preguntas se agregan en la pantalla, debajo de su tarjeta.
					</DialogDescription>
				</DialogHeader>
				{open && (
					<FollowUpSettingsForm
						key={followUp?.documentId ?? "new"}
						courseDocumentId={courseDocumentId}
						followUp={followUp}
						sessions={sessions}
						onCancel={() => onOpenChange(false)}
						onSaved={onSaved}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function FollowUpSettingsForm({
	courseDocumentId,
	followUp,
	sessions,
	onCancel,
	onSaved,
}: {
	courseDocumentId: string;
	followUp: FollowUpView | null;
	sessions: SessionRefs;
	onCancel: () => void;
	onSaved: (documentId: string) => void;
}) {
	const id = useId();
	const saver = useFetcherPromise<AppResponse<{ documentId: string }>>();
	useFetcherToast(saver.fetcher);
	const [draft, setDraft] = useState(() => draftOf(followUp, sessions));
	const locked = (followUp?.attemptCount ?? 0) > 0;
	const busy = saver.fetcher.state !== "idle";
	const incomplete =
		draft.title.trim() === "" || draft.sessionDocumentId === "";

	const update = (patch: Partial<SettingsDraft>) =>
		setDraft((previous) => ({ ...previous, ...patch }));

	const submit = async () => {
		const result = await saver.submit(
			{
				[INTENT_FIELD]: CONTENT_INTENTS.saveFollowUp,
				[PAYLOAD_FIELD]: JSON.stringify({
					followUpDocumentId: followUp?.documentId ?? null,
					title: draft.title,
					passingScore: numberOrNull(draft.passingScore),
					maxAttempts: draft.maxAttempts,
					shuffleQuestions: draft.shuffleQuestions,
					sessionDocumentId: draft.sessionDocumentId,
					countsTowardGrade: draft.countsTowardGrade,
					availability: draft.availability,
					opensBeforeMinutes: numberOrNull(draft.opensBeforeMinutes),
					closesAfterMinutes: numberOrNull(draft.closesAfterMinutes),
				}),
			},
			{ method: "post", action: quizPath(courseDocumentId) },
		);
		if (result?.success && result.data) onSaved(result.data.documentId);
	};

	return (
		<>
			<form
				id={`${id}-form`}
				className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1"
				onSubmit={(event) => {
					event.preventDefault();
					// React propaga por su árbol aunque Radix portale el diálogo fuera
					// del DOM: sin esto el envío llega al formulario del wizard, que
					// guardaría el paso y avanzaría.
					event.stopPropagation();
					if (!incomplete) void submit();
				}}
			>
				<div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${id}-title`}>Nombre de la evaluación</Label>
						<Input
							id={`${id}-title`}
							value={draft.title}
							placeholder="Práctica: presupuesto base"
							onChange={(event) => update({ title: event.target.value })}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${id}-passing`}>Se aprueba con</Label>
						<div className="relative">
							<Input
								id={`${id}-passing`}
								type="number"
								inputMode="numeric"
								min={0}
								max={100}
								value={draft.passingScore}
								disabled={locked}
								className="pr-8 tabular-nums"
								onChange={(event) =>
									update({ passingScore: event.target.value })
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

				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${id}-session`}>Sesión</Label>
					<Select
						value={draft.sessionDocumentId}
						disabled={locked}
						onValueChange={(value) => update({ sessionDocumentId: value })}
					>
						<SelectTrigger id={`${id}-session`} className="w-full">
							<SelectValue placeholder="Elige la sesión" />
						</SelectTrigger>
						<SelectContent>
							{sessions.map((session, index) => (
								<SelectItem key={session.documentId} value={session.documentId}>
									{sessionLabel(index, session)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Solo la presenta quien registra asistencia en esa sesión.
					</p>
				</div>

				<div className="flex items-start gap-3">
					<Checkbox
						id={`${id}-counts`}
						checked={draft.countsTowardGrade}
						disabled={locked}
						onCheckedChange={(value) =>
							update({ countsTowardGrade: value === true })
						}
						className="mt-0.5"
					/>
					<div className="flex flex-col gap-0.5">
						<Label htmlFor={`${id}-counts`} className="font-medium text-sm">
							Cuenta para la calificación de la capacitación
						</Label>
						<p className="text-muted-foreground text-xs">
							Su mejor nota entra al promedio; quien no la presenta antes de que
							cierre saca 0.
						</p>
					</div>
				</div>

				<fieldset className="flex flex-col gap-3">
					<legend className="mb-2 font-medium text-sm">
						¿Cuándo pueden presentarla?
					</legend>
					<RadioGroup
						value={draft.availability}
						onValueChange={(value) =>
							update({ availability: value as FollowUpAvailabilityMode })
						}
						className="grid gap-2 sm:grid-cols-2"
					>
						{AVAILABILITY_OPTIONS.map((option) => (
							<Label
								key={option.value}
								htmlFor={`${id}-${option.value}`}
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 font-normal",
									draft.availability === option.value &&
										"border-primary bg-primary/5",
								)}
							>
								<RadioGroupItem
									id={`${id}-${option.value}`}
									value={option.value}
									className="mt-0.5"
								/>
								<span className="flex flex-col gap-0.5">
									<span className="font-medium text-sm">{option.label}</span>
									<span className="text-muted-foreground text-xs">
										{option.description}
									</span>
								</span>
							</Label>
						))}
					</RadioGroup>

					{draft.availability === "RANGE" && (
						<div className="grid gap-3 sm:grid-cols-2">
							<MinutesField
								id={`${id}-before`}
								label="Minutos antes del inicio"
								value={draft.opensBeforeMinutes}
								onChange={(value) => update({ opensBeforeMinutes: value })}
							/>
							<MinutesField
								id={`${id}-after`}
								label="Minutos después del fin"
								value={draft.closesAfterMinutes}
								onChange={(value) => update({ closesAfterMinutes: value })}
							/>
						</div>
					)}
					{draft.availability === "SESSION_END" && (
						<div className="grid gap-3 sm:grid-cols-2">
							<MinutesField
								id={`${id}-after`}
								label="Minutos que queda abierta"
								value={draft.closesAfterMinutes}
								onChange={(value) => update({ closesAfterMinutes: value })}
							/>
						</div>
					)}
				</fieldset>

				<AttemptsPicker
					id={`${id}-attempts`}
					value={draft.maxAttempts}
					disabled={locked}
					onChange={(maxAttempts) => update({ maxAttempts })}
				/>

				<div className="flex items-center gap-3">
					<Switch
						id={`${id}-shuffle`}
						checked={draft.shuffleQuestions}
						disabled={locked}
						onCheckedChange={(checked) => update({ shuffleQuestions: checked })}
					/>
					<Label htmlFor={`${id}-shuffle`} className="font-normal">
						Mostrar las preguntas en distinto orden a cada participante
					</Label>
				</div>

				{locked && (
					<p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground text-xs">
						Alguien ya la presentó: la sesión, si cuenta, la mínima, los
						intentos y el orden ya no cambian. Su nombre y su ventana sí.
					</p>
				)}
			</form>

			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancelar
				</Button>
				<Button
					type="submit"
					form={`${id}-form`}
					disabled={incomplete}
					pending={busy}
				>
					{followUp ? "Guardar cambios" : "Crear evaluación"}
				</Button>
			</DialogFooter>
		</>
	);
}

function MinutesField({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type="number"
				inputMode="numeric"
				min={0}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}
