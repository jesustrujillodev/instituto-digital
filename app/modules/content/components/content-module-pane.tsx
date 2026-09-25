import { ClipboardCheck, ClipboardPlus, FilePlus2 } from "lucide-react";
import {
	type Ref,
	useEffect,
	useId,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import {
	CONTENT_DESCRIPTION_MAX_LENGTH,
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_TITLE_MAX_LENGTH,
} from "../domain/content.config";
import type { ContentModule } from "../domain/content.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	contentPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
} from "../utils/content-form";
import { formatMinutes, minutesOf } from "../utils/content-outline";
import { reportSaveFailure } from "../utils/report-save-failure";
import {
	type PaneHandle,
	PaneHeader,
	PaneMenu,
	PaneTitleInput,
} from "./content-pane-parts";
import { QuizBankPanel } from "./quiz-bank-panel";

interface ModuleDraft {
	title: string;
	description: string;
}

const draftOf = (module: ContentModule): ModuleDraft => ({
	title: module.title,
	description: module.description ?? "",
});

const sameDraft = (a: ModuleDraft, b: ModuleDraft) =>
	a.title.trim() === b.title.trim() &&
	a.description.trim() === b.description.trim();

/** Un módulo abierto en el editor: su nombre, su descripción y qué contiene. */
export function ContentModulePane({
	ref,
	courseDocumentId,
	module,
	trail,
	canWrite,
	busy,
	autoFocusTitle,
	canMoveUp,
	canMoveDown,
	onMove,
	onArchive,
	onAddLesson,
	onOpenQuiz,
	onDirtyChange,
	onTitleChange,
}: {
	ref: Ref<PaneHandle>;
	courseDocumentId: string;
	module: ContentModule;
	trail: string;
	canWrite: boolean;
	busy: boolean;
	autoFocusTitle: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMove: (delta: number) => void;
	onArchive: () => void;
	onAddLesson: () => void;
	onOpenQuiz: () => void;
	onDirtyChange: (dirty: boolean) => void;
	onTitleChange: (title: string) => void;
}) {
	const id = useId();
	const titleRef = useRef<HTMLInputElement>(null);
	const saver = useFetcherPromise<ContentActionData>();
	const [saved, setSaved] = useState(() => draftOf(module));
	const [draft, setDraft] = useState(() => draftOf(module));

	const dirty = canWrite && !sameDraft(draft, saved);
	const saving = saver.fetcher.state !== "idle";

	useEffect(() => {
		onDirtyChange(dirty);
	}, [dirty, onDirtyChange]);

	useEffect(() => {
		if (autoFocusTitle) titleRef.current?.select();
	}, [autoFocusTitle]);

	const flush = async () => {
		if (!dirty) return true;
		if (draft.title.trim() === "") {
			reportSaveFailure("Revisa el módulo", "El módulo necesita un nombre.");
			return false;
		}

		const result = await saver.submit(
			{
				[INTENT_FIELD]: CONTENT_INTENTS.updateModule,
				[PAYLOAD_FIELD]: JSON.stringify({
					moduleDocumentId: module.documentId,
					title: draft.title.trim(),
					description: draft.description.trim(),
				}),
			},
			{ method: "post", action: contentPath(courseDocumentId) },
		);

		if (!result?.success) {
			reportSaveFailure("No se pudo guardar el módulo", result);
			return false;
		}
		setSaved({
			title: draft.title.trim(),
			description: draft.description.trim(),
		});
		return true;
	};

	useImperativeHandle(ref, () => ({ flush }));

	const minutes = minutesOf(module.lessons);
	const lessonCount = module.lessons.length;
	const archiveBlocked =
		lessonCount > 0
			? "Archiva primero sus lecciones"
			: module.quiz
				? "Archiva primero su evaluación"
				: undefined;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-4 pb-6 sm:px-6">
			<div className="flex flex-col gap-4">
				<PaneHeader
					trail={trail}
					saving={saving}
					dirty={dirty}
					menu={
						canWrite ? (
							<PaneMenu
								label={`el módulo ${module.title}`}
								busy={busy || saving}
								canMoveUp={canMoveUp}
								canMoveDown={canMoveDown}
								onMove={onMove}
								archive={{
									label: "Archivar módulo",
									disabledReason: archiveBlocked,
									onClick: onArchive,
								}}
							/>
						) : null
					}
				/>

				<PaneTitleInput
					ref={titleRef}
					label="Nombre del módulo"
					placeholder="Nombre del módulo"
					value={draft.title}
					maxLength={CONTENT_TITLE_MAX_LENGTH}
					disabled={!canWrite}
					onChange={(title) => {
						setDraft((current) => ({ ...current, title }));
						onTitleChange(title);
					}}
				/>

				<p className="text-muted-foreground text-sm">
					{lessonCount === 0
						? "Todavía sin lecciones."
						: `${lessonCount} ${lessonCount === 1 ? "lección" : "lecciones"}${minutes > 0 ? ` · ${formatMinutes(minutes)} estimados` : ""}`}
					{module.quiz && " · con evaluación"}
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor={`${id}-description`}>Descripción</Label>
				<Textarea
					id={`${id}-description`}
					placeholder="Qué cubre este módulo (opcional)"
					value={draft.description}
					maxLength={CONTENT_DESCRIPTION_MAX_LENGTH}
					disabled={!canWrite}
					rows={4}
					onChange={(event) =>
						setDraft((current) => ({
							...current,
							description: event.target.value,
						}))
					}
				/>
			</div>

			{canWrite && (
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={busy || lessonCount >= CONTENT_MAX_LESSONS_PER_MODULE}
						onClick={onAddLesson}
					>
						<FilePlus2 aria-hidden="true" />
						Agregar lección
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onOpenQuiz}
					>
						{module.quiz ? (
							<ClipboardCheck aria-hidden="true" />
						) : (
							<ClipboardPlus aria-hidden="true" />
						)}
						{module.quiz
							? "Abrir la evaluación del módulo"
							: "Agregar evaluación del módulo"}
					</Button>
				</div>
			)}
		</div>
	);
}

/**
 * La evaluación de un módulo (docs/adr/0016). Aprobarla cuenta para el avance
 * como una lección obligatoria más.
 */
export function ContentModuleQuizPane({
	courseDocumentId,
	module,
	trail,
	canWrite,
	busy,
	onArchive,
}: {
	courseDocumentId: string;
	module: ContentModule;
	trail: string;
	canWrite: boolean;
	busy: boolean;
	onArchive: () => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-4 pb-6 sm:px-6">
			<div className="flex flex-col gap-3">
				<PaneHeader
					trail={trail}
					saving={false}
					dirty={false}
					menu={
						canWrite && module.quiz ? (
							<PaneMenu
								label={`la evaluación del módulo ${module.title}`}
								busy={busy}
								canMoveUp={false}
								canMoveDown={false}
								archive={{
									label: "Archivar evaluación del módulo",
									onClick: onArchive,
								}}
							/>
						) : null
					}
				/>
				<h3 className="font-bold text-2xl tracking-tight">
					Evaluación del módulo
				</h3>
				<p className="max-w-prose text-muted-foreground text-sm">
					Si el curso cuenta el contenido, hay que aprobarla para completarlo; a
					quien la repruebe, quien imparte le puede habilitar otro intento.
				</p>
			</div>

			<QuizBankPanel
				courseDocumentId={courseDocumentId}
				owner={{ lessonDocumentId: null, moduleDocumentId: module.documentId }}
				defaultTitle={`Evaluación · ${module.title}`}
				canWrite={canWrite}
			/>
		</div>
	);
}
