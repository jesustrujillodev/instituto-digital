import { LayoutList, Plus } from "lucide-react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type {
	ContentCreated,
	CourseContentTree,
	ReorderContentDto,
} from "../domain/content.types";
import {
	CONTENT_INTENTS,
	type ContentActionData,
	contentPath,
	INTENT_FIELD,
	PAYLOAD_FIELD,
	quizPath,
} from "../utils/content-form";
import {
	findLesson,
	initialSelection,
	isSameSelection,
	neighborsOf,
	type OutlineSelection,
	selectionExists,
	withLessonMoved,
	withModuleMoved,
} from "../utils/content-outline";
import { ContentLessonPane } from "./content-lesson-pane";
import {
	ContentModulePane,
	ContentModuleQuizPane,
} from "./content-module-pane";
import type { PaneHandle } from "./content-pane-parts";
import { ContentStructureNav } from "./content-structure-nav";

const NEW_LESSON_TITLE = "Nueva lección";

/** Quien monta el editor recibe aquí con qué guardar lo pendiente. */
export type ContentSaveRef = RefObject<(() => Promise<boolean>) | null>;

/**
 * El temario en dos paneles: la estructura a la izquierda y el elemento
 * abierto a la derecha.
 *
 * Lo que se edita a la derecha se guarda al cambiar de elemento y cuando quien
 * monta el editor lo pide por `saveRef` (Continuar, en el wizard).
 */
export function CourseContentWorkspace({
	courseDocumentId,
	tree,
	canWrite,
	saveRef,
	onDirtyChange,
}: {
	courseDocumentId: string;
	tree: CourseContentTree;
	canWrite: boolean;
	saveRef: ContentSaveRef;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const mutation = useFetcherPromise<ContentActionData>();
	useFetcherToast(mutation.fetcher);

	const paneRef = useRef<PaneHandle>(null);
	const [selection, setSelection] = useState<OutlineSelection | null>(() =>
		initialSelection(tree),
	);
	const [focusTitleOf, setFocusTitleOf] = useState<string | null>(null);
	const [liveTitle, setLiveTitle] = useState<string | null>(null);
	const busy = mutation.fetcher.state !== "idle";

	// Tras archivar, o si otro lo borró, lo seleccionado deja de existir.
	useEffect(() => {
		if (selection && selectionExists(tree, selection)) return;
		setSelection(initialSelection(tree));
		setLiveTitle(null);
	}, [tree, selection]);

	const flush = useCallback(
		async () => (paneRef.current ? paneRef.current.flush() : true),
		[],
	);

	useEffect(() => {
		saveRef.current = flush;
		return () => {
			saveRef.current = null;
			onDirtyChange(false);
		};
	}, [saveRef, flush, onDirtyChange]);

	const open = (next: OutlineSelection, focusTitle = false) => {
		setSelection(next);
		setLiveTitle(null);
		setFocusTitleOf(
			focusTitle && next.kind !== "quiz" ? next.documentId : null,
		);
	};

	const select = async (next: OutlineSelection) => {
		if (isSameSelection(next, selection)) return;
		if (!(await flush())) return;
		open(next);
	};

	const mutate = (intent: string, payload: unknown, action?: string) =>
		mutation.submit(
			{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(payload) },
			{ method: "post", action: action ?? contentPath(courseDocumentId) },
		);

	const createdId = (result: ContentActionData | undefined) =>
		result?.success ? (result.data as ContentCreated | null)?.documentId : null;

	const addModule = async () => {
		if (!(await flush())) return;
		const result = await mutate(CONTENT_INTENTS.createModule, {
			title: `Módulo ${tree.length + 1}`,
			description: "",
		});
		const documentId = createdId(result);
		if (documentId) open({ kind: "module", documentId }, true);
	};

	const addLesson = async (moduleDocumentId: string) => {
		if (!(await flush())) return;
		const result = await mutate(CONTENT_INTENTS.createLesson, {
			moduleDocumentId,
			title: NEW_LESSON_TITLE,
			type: "TEXT",
			isRequired: true,
			estimatedMinutes: null,
		});
		const documentId = createdId(result);
		if (documentId) open({ kind: "lesson", documentId }, true);
	};

	// Reordenar no toca lo que se edita: el panel sigue abierto con su borrador.
	const reorder = (order: ReorderContentDto) =>
		void mutate(CONTENT_INTENTS.reorder, order);

	const archive = async (
		intent: string,
		payload: unknown,
		then: OutlineSelection | null,
		action?: string,
	) => {
		const result = await mutate(intent, payload, action);
		if (!result?.success) return;
		if (then) open(then);
	};

	const renderPane = () => {
		if (!selection) return null;

		if (selection.kind === "lesson") {
			const position = findLesson(tree, selection.documentId);
			if (!position) return null;

			const { module, moduleIndex, lesson, lessonIndex } = position;
			const { previous, next } = neighborsOf(tree, lesson.documentId);
			const titleOf = (documentId: string) =>
				findLesson(tree, documentId)?.lesson.title ?? "";

			return (
				<ContentLessonPane
					key={lesson.documentId}
					ref={paneRef}
					courseDocumentId={courseDocumentId}
					lesson={lesson}
					trail={`Módulo ${moduleIndex + 1} · Lección ${lessonIndex + 1} de ${module.lessons.length}`}
					canWrite={canWrite}
					busy={busy}
					autoFocusTitle={focusTitleOf === lesson.documentId}
					previous={
						previous
							? {
									label: `Lección anterior: ${titleOf(previous)}`,
									onClick: () =>
										void select({ kind: "lesson", documentId: previous }),
								}
							: null
					}
					next={
						next
							? {
									label: `Lección siguiente: ${titleOf(next)}`,
									onClick: () =>
										void select({ kind: "lesson", documentId: next }),
								}
							: null
					}
					canMoveUp={lessonIndex > 0}
					canMoveDown={lessonIndex < module.lessons.length - 1}
					onMove={(delta) =>
						reorder(withLessonMoved(tree, moduleIndex, lessonIndex, delta))
					}
					onArchive={() =>
						void archive(
							CONTENT_INTENTS.archiveLesson,
							{ lessonDocumentId: lesson.documentId },
							next
								? { kind: "lesson", documentId: next }
								: previous
									? { kind: "lesson", documentId: previous }
									: { kind: "module", documentId: module.documentId },
						)
					}
					onDirtyChange={onDirtyChange}
					onTitleChange={setLiveTitle}
				/>
			);
		}

		const moduleId =
			selection.kind === "module"
				? selection.documentId
				: selection.moduleDocumentId;
		const moduleIndex = tree.findIndex(
			(entry) => entry.documentId === moduleId,
		);
		const module = tree[moduleIndex];
		if (!module) return null;

		if (selection.kind === "quiz") {
			return (
				<ContentModuleQuizPane
					key={`quiz-${module.documentId}`}
					courseDocumentId={courseDocumentId}
					module={module}
					trail={`Módulo ${moduleIndex + 1} · Evaluación`}
					canWrite={canWrite}
					busy={busy}
					onArchive={() =>
						void archive(
							CONTENT_INTENTS.archiveModuleQuiz,
							{ moduleDocumentId: module.documentId },
							{ kind: "module", documentId: module.documentId },
							quizPath(courseDocumentId),
						)
					}
				/>
			);
		}

		return (
			<ContentModulePane
				key={module.documentId}
				ref={paneRef}
				courseDocumentId={courseDocumentId}
				module={module}
				trail={`Módulo ${moduleIndex + 1} de ${tree.length}`}
				canWrite={canWrite}
				busy={busy}
				autoFocusTitle={focusTitleOf === module.documentId}
				canMoveUp={moduleIndex > 0}
				canMoveDown={moduleIndex < tree.length - 1}
				onMove={(delta) => reorder(withModuleMoved(tree, moduleIndex, delta))}
				onArchive={() =>
					void archive(
						CONTENT_INTENTS.archiveModule,
						{ moduleDocumentId: module.documentId },
						null,
					)
				}
				onAddLesson={() => void addLesson(module.documentId)}
				onOpenQuiz={() =>
					void select({ kind: "quiz", moduleDocumentId: module.documentId })
				}
				onDirtyChange={onDirtyChange}
				onTitleChange={setLiveTitle}
			/>
		);
	};

	if (tree.length === 0) {
		return (
			<Empty className="border border-border border-dashed p-10">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<LayoutList aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Sin temario todavía</EmptyTitle>
					<EmptyDescription>
						Un módulo agrupa lecciones. Para publicar el curso hace falta al
						menos una lección.
					</EmptyDescription>
				</EmptyHeader>
				{canWrite && (
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={() => void addModule()}
					>
						<Plus aria-hidden="true" />
						Agregar el primer módulo
					</Button>
				)}
			</Empty>
		);
	}

	return (
		// El editor vive dentro del formulario del wizard: Enter en un campo de una
		// línea lo enviaría y avanzaría de paso.
		// biome-ignore lint/a11y/noStaticElementInteractions: solo intercepta Enter de los campos que contiene.
		<div
			onKeyDown={(event) => {
				if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
					event.preventDefault();
				}
			}}
			className="grid h-[min(48rem,calc(100dvh-11rem))] min-h-[34rem] grid-cols-[18.5rem_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card"
		>
			<ContentStructureNav
				tree={tree}
				selection={selection}
				onSelect={(next) => void select(next)}
				onAddModule={() => void addModule()}
				onAddLesson={(moduleDocumentId) => void addLesson(moduleDocumentId)}
				canWrite={canWrite}
				busy={busy}
				liveTitle={liveTitle}
			/>
			<section
				aria-label="Elemento abierto"
				className="flex min-h-0 min-w-0 flex-col"
			>
				{renderPane()}
			</section>
		</div>
	);
}
