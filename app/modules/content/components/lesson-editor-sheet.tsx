import { Archive, ArrowRight, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import {
	CONTENT_TITLE_MAX_LENGTH,
	LESSON_MAX_ESTIMATED_MINUTES,
} from "../domain/content.config";
import type { ContentLesson, CourseContentTree } from "../domain/content.types";
import { useLessonEditor } from "../hooks/use-lesson-editor";
import { findLesson, neighborsOf } from "../utils/content-outline";
import { LessonMaterialFields } from "./lesson-material-fields";
import { LessonTypePicker } from "./lesson-type-picker";

type Flush = () => Promise<boolean>;

/**
 * La lección completa en un panel lateral: su ficha y su material.
 *
 * No tiene botón de guardar: lo pendiente se guarda al cerrar, al pasar a la
 * siguiente o con Listo. Si el guardado falla, el panel no se cierra.
 */
export function LessonEditorSheet({
	courseDocumentId,
	tree,
	lessonDocumentId,
	canWrite,
	busy,
	onNavigate,
	onClose,
	onArchive,
}: {
	courseDocumentId: string;
	tree: CourseContentTree;
	/** `null` con el panel cerrado. */
	lessonDocumentId: string | null;
	canWrite: boolean;
	busy: boolean;
	onNavigate: (lessonDocumentId: string) => void;
	onClose: () => void;
	onArchive: (lessonDocumentId: string) => void;
}) {
	const flushRef = useRef<Flush | null>(null);
	const position = lessonDocumentId ? findLesson(tree, lessonDocumentId) : null;

	// La lección puede archivarse desde otra pestaña mientras está abierta.
	useEffect(() => {
		if (lessonDocumentId && !position) onClose();
	}, [lessonDocumentId, position, onClose]);

	const leave = async (then: () => void) => {
		if (flushRef.current && !(await flushRef.current())) return;
		then();
	};

	const next = position
		? neighborsOf(tree, position.lesson.documentId).next
		: null;

	return (
		<Sheet
			open={position !== null}
			onOpenChange={(open) => {
				if (!open) void leave(onClose);
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				className="w-full gap-0 sm:max-w-lg"
			>
				{position && (
					<LessonEditorBody
						key={position.lesson.documentId}
						courseDocumentId={courseDocumentId}
						lesson={position.lesson}
						trail={`Módulo ${position.moduleIndex + 1} · Lección ${position.lessonIndex + 1} de ${position.module.lessons.length}`}
						canWrite={canWrite}
						busy={busy}
						flushRef={flushRef}
						onClose={() => void leave(onClose)}
						onNext={next ? () => void leave(() => onNavigate(next)) : null}
						onArchive={() => onArchive(position.lesson.documentId)}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

function LessonEditorBody({
	courseDocumentId,
	lesson,
	trail,
	canWrite,
	busy,
	flushRef,
	onClose,
	onNext,
	onArchive,
}: {
	courseDocumentId: string;
	lesson: ContentLesson;
	trail: string;
	canWrite: boolean;
	busy: boolean;
	flushRef: React.RefObject<Flush | null>;
	onClose: () => void;
	onNext: (() => void) | null;
	onArchive: () => void;
}) {
	const id = useId();
	const editor = useLessonEditor({ courseDocumentId, lesson, canWrite });
	const { draft, update, saving } = editor;

	// Sin dependencias a propósito: el panel de afuera siempre guarda con el
	// borrador de este render.
	useEffect(() => {
		flushRef.current = editor.flush;
	});

	return (
		<>
			<header className="flex items-start justify-between gap-3 border-border border-b px-6 pt-5 pb-4">
				<div className="flex min-w-0 flex-col gap-0.5">
					<SheetDescription className="text-xs">{trail}</SheetDescription>
					<SheetTitle className="truncate font-bold text-lg">
						{draft.title.trim() || "Lección sin nombre"}
					</SheetTitle>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Cerrar"
					className="shrink-0 bg-secondary"
					onClick={onClose}
				>
					<X aria-hidden="true" />
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
				<div className="flex flex-col gap-2">
					<Label htmlFor={`${id}-title`}>Nombre</Label>
					<Input
						id={`${id}-title`}
						value={draft.title}
						maxLength={CONTENT_TITLE_MAX_LENGTH}
						disabled={!canWrite}
						aria-invalid={draft.title.trim() === ""}
						onChange={(event) => update({ title: event.target.value })}
					/>
				</div>

				<div className="flex flex-col gap-2">
					<span id={`${id}-type`} className="font-medium text-sm">
						Tipo de material
					</span>
					<LessonTypePicker
						variant="grid"
						labelledBy={`${id}-type`}
						value={draft.type}
						onChange={(type) => void editor.changeType(type)}
						disabled={!canWrite || saving}
					/>
				</div>

				<div className="flex flex-col gap-2">
					<span className="font-medium text-sm">Material</span>
					<LessonMaterialFields
						courseDocumentId={courseDocumentId}
						lesson={editor.materialLesson}
						state={editor.material}
						canWrite={canWrite}
					/>
				</div>

				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${id}-minutes`}>Minutos estimados</Label>
						<Input
							id={`${id}-minutes`}
							type="number"
							inputMode="numeric"
							min={1}
							max={LESSON_MAX_ESTIMATED_MINUTES}
							placeholder="Opcional"
							value={draft.minutes}
							disabled={!canWrite}
							onChange={(event) => update({ minutes: event.target.value })}
							className="w-32 tabular-nums"
						/>
					</div>
					<div className="flex h-9 items-center gap-3">
						<Label htmlFor={`${id}-required`} className="font-normal text-sm">
							Obligatoria para completar el curso
						</Label>
						<Switch
							id={`${id}-required`}
							checked={draft.isRequired}
							disabled={!canWrite}
							onCheckedChange={(isRequired) => update({ isRequired })}
						/>
					</div>
				</div>
			</div>

			<footer className="flex items-center gap-2 border-border border-t px-6 py-4">
				{canWrite && (
					<Button
						type="button"
						variant="ghost"
						disabled={busy || saving}
						onClick={onArchive}
						className="-ml-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
					>
						<Archive aria-hidden="true" />
						Archivar lección
					</Button>
				)}
				<div className="ml-auto flex items-center gap-2">
					{onNext && (
						<Button
							type="button"
							variant="outline"
							disabled={saving}
							onClick={onNext}
						>
							Siguiente
							<ArrowRight aria-hidden="true" />
						</Button>
					)}
					<Button type="button" disabled={saving} onClick={onClose}>
						{saving && <Loader2 className="animate-spin" aria-hidden="true" />}
						{saving ? "Guardando…" : "Listo"}
					</Button>
				</div>
			</footer>
		</>
	);
}
