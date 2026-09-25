import { Clock } from "lucide-react";
import { type Ref, useEffect, useId, useImperativeHandle, useRef } from "react";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Separator } from "@/shared/components/ui/separator";
import { Switch } from "@/shared/components/ui/switch";
import {
	CONTENT_TITLE_MAX_LENGTH,
	LESSON_MAX_ESTIMATED_MINUTES,
} from "../domain/content.config";
import type { ContentLesson } from "../domain/content.types";
import { useLessonEditor } from "../hooks/use-lesson-editor";
import {
	type PaneHandle,
	PaneHeader,
	PaneMenu,
	PaneTitleInput,
} from "./content-pane-parts";
import { LessonMaterialFields } from "./lesson-material-fields";
import { LessonTypePicker } from "./lesson-type-picker";

/**
 * Una lección abierta en el editor del temario.
 *
 * Todo se edita en borrador y se guarda cuando el editor lo pide —al cambiar
 * de elemento o de paso—. El tipo es la excepción: cambia qué material se
 * captura, así que se guarda en el momento.
 */
export function ContentLessonPane({
	ref,
	courseDocumentId,
	lesson,
	trail,
	canWrite,
	busy,
	autoFocusTitle,
	previous,
	next,
	canMoveUp,
	canMoveDown,
	onMove,
	onArchive,
	onDirtyChange,
	onTitleChange,
}: {
	ref: Ref<PaneHandle>;
	courseDocumentId: string;
	lesson: ContentLesson;
	/** "Módulo 1 · Lección 2 de 3". */
	trail: string;
	canWrite: boolean;
	busy: boolean;
	autoFocusTitle: boolean;
	previous: { label: string; onClick: () => void } | null;
	next: { label: string; onClick: () => void } | null;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMove: (delta: number) => void;
	onArchive: () => void;
	onDirtyChange: (dirty: boolean) => void;
	onTitleChange: (title: string) => void;
}) {
	const id = useId();
	const titleRef = useRef<HTMLInputElement>(null);
	const editor = useLessonEditor({ courseDocumentId, lesson, canWrite });
	const { draft, update, dirty, saving } = editor;

	useEffect(() => {
		onDirtyChange(dirty);
	}, [dirty, onDirtyChange]);

	useEffect(() => {
		if (autoFocusTitle) titleRef.current?.select();
	}, [autoFocusTitle]);

	useImperativeHandle(ref, () => ({ flush: editor.flush }));

	return (
		<>
			<div className="flex flex-col gap-4 px-4 pt-4 pb-5 sm:px-6">
				<PaneHeader
					trail={trail}
					saving={saving}
					dirty={dirty}
					previous={previous}
					next={next}
					menu={
						canWrite ? (
							<PaneMenu
								label={`la lección ${lesson.title}`}
								busy={busy || saving}
								canMoveUp={canMoveUp}
								canMoveDown={canMoveDown}
								onMove={onMove}
								archive={{ label: "Archivar lección", onClick: onArchive }}
							/>
						) : null
					}
				/>

				<PaneTitleInput
					ref={titleRef}
					label="Nombre de la lección"
					placeholder="Nombre de la lección"
					value={draft.title}
					maxLength={CONTENT_TITLE_MAX_LENGTH}
					disabled={!canWrite}
					onChange={(title) => {
						update({ title });
						onTitleChange(title);
					}}
				/>

				<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
					<LessonTypePicker
						value={draft.type}
						onChange={(type) => void editor.changeType(type)}
						disabled={!canWrite || saving}
					/>

					<Separator orientation="vertical" className="hidden h-6 sm:block" />

					<div className="flex items-center gap-2">
						<Clock
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						<Label htmlFor={`${id}-minutes`} className="sr-only">
							Minutos estimados
						</Label>
						<Input
							id={`${id}-minutes`}
							type="number"
							inputMode="numeric"
							min={1}
							max={LESSON_MAX_ESTIMATED_MINUTES}
							placeholder="—"
							value={draft.minutes}
							disabled={!canWrite}
							onChange={(event) => update({ minutes: event.target.value })}
							className="h-8 w-16 tabular-nums"
						/>
						<span className="text-muted-foreground text-sm" aria-hidden="true">
							min
						</span>
					</div>

					<div className="ml-auto flex items-center gap-2">
						<Switch
							id={`${id}-required`}
							checked={draft.isRequired}
							disabled={!canWrite}
							onCheckedChange={(isRequired) => update({ isRequired })}
						/>
						<Label htmlFor={`${id}-required`} className="font-normal text-sm">
							Obligatoria
						</Label>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto border-border border-t">
				<LessonMaterialFields
					courseDocumentId={courseDocumentId}
					lesson={editor.materialLesson}
					state={editor.material}
					canWrite={canWrite}
					variant="flush"
				/>
			</div>
		</>
	);
}
