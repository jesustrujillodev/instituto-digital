import {
	Archive,
	ChevronDown,
	ChevronUp,
	ClipboardCheck,
	ClipboardPlus,
	FilePlus2,
	LayoutList,
	Paperclip,
	Pencil,
	Plus,
} from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_MAX_MODULES_PER_COURSE,
} from "../domain/content.config";
import type {
	ContentLesson,
	ContentModule,
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
import { LESSON_TYPE_LABELS } from "../utils/content-labels";
import { ContentLessonDialog } from "./content-lesson-dialog";
import { ContentModuleDialog } from "./content-module-dialog";
import { LessonMaterialSheet } from "./lesson-material-sheet";
import { ModuleQuizSheet } from "./module-quiz-sheet";

/** Intercambia dos posiciones de un arreglo sin tocar el original. */
const swapped = <T,>(values: readonly T[], from: number, to: number): T[] => {
	const next = [...values];
	const moved = next[from];
	next[from] = next[to];
	next[to] = moved;

	return next;
};

const orderOf = (tree: CourseContentTree): ReorderContentDto => ({
	modules: tree.map((module) => module.documentId),
	lessons: tree.map((module) => ({
		moduleDocumentId: module.documentId,
		lessonDocumentIds: module.lessons.map((lesson) => lesson.documentId),
	})),
});

interface CourseContentManagerProps {
	courseDocumentId: string;
	tree: CourseContentTree;
	/** Un curso finalizado se consulta, no se edita. */
	canWrite?: boolean;
}

/**
 * El temario del curso.
 *
 * El mismo panel sirve al paso Contenido del alta y a la pantalla del curso
 * publicado: escribe siempre contra la ruta del módulo, así que las dos vías
 * comparten intents, mensajes y reglas.
 */
export function CourseContentManager({
	courseDocumentId,
	tree,
	canWrite = true,
}: CourseContentManagerProps) {
	const fetcher = useFetcher<ContentActionData>();
	useFetcherToast(fetcher);

	const [editingModule, setEditingModule] = useState<ContentModule | null>(
		null,
	);
	const [moduleOpen, setModuleOpen] = useState(false);
	const [lessonTarget, setLessonTarget] = useState<{
		moduleDocumentId: string;
		lesson: ContentLesson | null;
	} | null>(null);
	const [materialTarget, setMaterialTarget] = useState<ContentLesson | null>(
		null,
	);
	const [quizTarget, setQuizTarget] = useState<ContentModule | null>(null);

	const busy = fetcher.state !== "idle";
	const canAddModule = tree.length < CONTENT_MAX_MODULES_PER_COURSE;

	const send = (
		intent: string,
		payload: unknown,
		action = contentPath(courseDocumentId),
	) => {
		fetcher.submit(
			{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(payload) },
			{ method: "post", action },
		);
	};

	/** Siempre el orden completo: la regla nunca ve un movimiento relativo. */
	const reorder = (order: ReorderContentDto) =>
		send(CONTENT_INTENTS.reorder, order);

	const moveModule = (index: number, delta: number) => {
		const order = orderOf(tree);
		reorder({
			...order,
			modules: swapped(order.modules, index, index + delta),
		});
	};

	const moveLesson = (
		moduleIndex: number,
		lessonIndex: number,
		delta: number,
	) => {
		const order = orderOf(tree);
		const entry = order.lessons[moduleIndex];

		reorder({
			...order,
			lessons: order.lessons.map((row, index) =>
				index === moduleIndex
					? {
							...entry,
							lessonDocumentIds: swapped(
								entry.lessonDocumentIds,
								lessonIndex,
								lessonIndex + delta,
							),
						}
					: row,
			),
		});
	};

	const openNewModule = () => {
		setEditingModule(null);
		setModuleOpen(true);
	};

	return (
		<div className="flex flex-col gap-5">
			{tree.length === 0 ? (
				<Empty className="border border-border border-dashed p-8">
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
						<Button type="button" variant="outline" onClick={openNewModule}>
							<Plus aria-hidden="true" />
							Agregar el primer módulo
						</Button>
					)}
				</Empty>
			) : (
				<ol className="flex flex-col gap-4">
					{tree.map((module, moduleIndex) => (
						<li
							key={module.documentId}
							className="flex flex-col gap-3 rounded-2xl border border-border p-4"
						>
							<header className="flex flex-wrap items-start justify-between gap-2">
								<div className="flex min-w-0 flex-col gap-0.5">
									<h3 className="font-medium text-sm">
										{moduleIndex + 1}. {module.title}
									</h3>
									{module.description && (
										<p className="max-w-prose text-muted-foreground text-sm">
											{module.description}
										</p>
									)}
								</div>

								{canWrite && (
									<div className="flex items-center gap-1">
										<MoveButtons
											label={`el módulo ${module.title}`}
											index={moduleIndex}
											total={tree.length}
											disabled={busy}
											onMove={(delta) => moveModule(moduleIndex, delta)}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={`Editar el módulo ${module.title}`}
											onClick={() => {
												setEditingModule(module);
												setModuleOpen(true);
											}}
										>
											<Pencil aria-hidden="true" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={`Archivar el módulo ${module.title}`}
											title={
												module.lessons.length > 0
													? "Archiva primero sus lecciones"
													: module.quiz
														? "Archiva primero su evaluación"
														: undefined
											}
											disabled={
												busy ||
												module.lessons.length > 0 ||
												module.quiz !== null
											}
											onClick={() =>
												send(CONTENT_INTENTS.archiveModule, {
													moduleDocumentId: module.documentId,
												})
											}
										>
											<Archive aria-hidden="true" />
										</Button>
									</div>
								)}
							</header>

							{module.lessons.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									Sin lecciones todavía.
								</p>
							) : (
								<ol className="flex flex-col gap-1">
									{module.lessons.map((lesson, lessonIndex) => (
										<li
											key={lesson.documentId}
											className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-muted"
										>
											<div className="flex min-w-0 flex-wrap items-center gap-2">
												<span className="text-sm">{lesson.title}</span>
												<Badge variant="outline">
													{LESSON_TYPE_LABELS[lesson.type]}
												</Badge>
												{!lesson.hasMaterial && (
													<Badge variant="secondary">Sin material</Badge>
												)}
												{!lesson.isRequired && (
													<span className="text-muted-foreground text-xs">
														Opcional
													</span>
												)}
												{lesson.estimatedMinutes !== null && (
													<span className="text-muted-foreground text-xs">
														{lesson.estimatedMinutes} min
													</span>
												)}
											</div>

											<div className="flex items-center gap-1">
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={`Material de la lección ${lesson.title}`}
													onClick={() => setMaterialTarget(lesson)}
												>
													<Paperclip aria-hidden="true" />
												</Button>
											</div>

											{canWrite && (
												<div className="flex items-center gap-1">
													<MoveButtons
														label={`la lección ${lesson.title}`}
														index={lessonIndex}
														total={module.lessons.length}
														disabled={busy}
														onMove={(delta) =>
															moveLesson(moduleIndex, lessonIndex, delta)
														}
													/>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label={`Editar la lección ${lesson.title}`}
														onClick={() =>
															setLessonTarget({
																moduleDocumentId: module.documentId,
																lesson,
															})
														}
													>
														<Pencil aria-hidden="true" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label={`Archivar la lección ${lesson.title}`}
														disabled={busy}
														onClick={() =>
															send(CONTENT_INTENTS.archiveLesson, {
																lessonDocumentId: lesson.documentId,
															})
														}
													>
														<Archive aria-hidden="true" />
													</Button>
												</div>
											)}
										</li>
									))}
								</ol>
							)}

							{module.quiz && (
								<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border border-dashed px-2 py-1.5">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<ClipboardCheck
											aria-hidden="true"
											className="size-4 text-muted-foreground"
										/>
										<span className="text-sm">{module.quiz.title}</span>
										<Badge variant="outline">Evaluación del módulo</Badge>
										<span className="text-muted-foreground text-xs">
											{module.quiz.questionCount}{" "}
											{module.quiz.questionCount === 1
												? "pregunta"
												: "preguntas"}
										</span>
									</div>
									<div className="flex items-center gap-1">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={`Preguntas de la evaluación del módulo ${module.title}`}
											onClick={() => setQuizTarget(module)}
										>
											<Pencil aria-hidden="true" />
										</Button>
										{canWrite && (
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={`Archivar la evaluación del módulo ${module.title}`}
												disabled={busy}
												onClick={() =>
													send(
														CONTENT_INTENTS.archiveModuleQuiz,
														{ moduleDocumentId: module.documentId },
														quizPath(courseDocumentId),
													)
												}
											>
												<Archive aria-hidden="true" />
											</Button>
										)}
									</div>
								</div>
							)}

							{canWrite && (
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={
											busy ||
											module.lessons.length >= CONTENT_MAX_LESSONS_PER_MODULE
										}
										onClick={() =>
											setLessonTarget({
												moduleDocumentId: module.documentId,
												lesson: null,
											})
										}
									>
										<FilePlus2 aria-hidden="true" />
										Agregar lección
									</Button>
									{!module.quiz && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={busy}
											onClick={() => setQuizTarget(module)}
										>
											<ClipboardPlus aria-hidden="true" />
											Agregar evaluación
										</Button>
									)}
								</div>
							)}
						</li>
					))}
				</ol>
			)}

			{canWrite && tree.length > 0 && (
				<div className="flex flex-col gap-1">
					<div>
						<Button
							type="button"
							variant="outline"
							disabled={busy || !canAddModule}
							onClick={openNewModule}
						>
							<Plus aria-hidden="true" />
							Agregar módulo
						</Button>
					</div>
					{!canAddModule && (
						<p className="text-muted-foreground text-xs">
							Máximo {CONTENT_MAX_MODULES_PER_COURSE} módulos.
						</p>
					)}
				</div>
			)}

			<ContentModuleDialog
				open={moduleOpen}
				onOpenChange={setModuleOpen}
				courseDocumentId={courseDocumentId}
				module={editingModule}
			/>

			<ContentLessonDialog
				open={lessonTarget !== null}
				onOpenChange={(open) => {
					if (!open) setLessonTarget(null);
				}}
				courseDocumentId={courseDocumentId}
				moduleDocumentId={lessonTarget?.moduleDocumentId ?? null}
				lesson={lessonTarget?.lesson ?? null}
			/>

			<ModuleQuizSheet
				open={quizTarget !== null}
				onOpenChange={(open) => {
					if (!open) setQuizTarget(null);
				}}
				courseDocumentId={courseDocumentId}
				module={quizTarget}
				canWrite={canWrite}
			/>

			<LessonMaterialSheet
				open={materialTarget !== null}
				onOpenChange={(open) => {
					if (!open) setMaterialTarget(null);
				}}
				courseDocumentId={courseDocumentId}
				lesson={materialTarget}
				canWrite={canWrite}
			/>
		</div>
	);
}

/** Subir y bajar: sin arrastre, que aquí no hay precedente ni hace falta. */
function MoveButtons({
	label,
	index,
	total,
	disabled,
	onMove,
}: {
	label: string;
	index: number;
	total: number;
	disabled: boolean;
	onMove: (delta: number) => void;
}) {
	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={`Subir ${label}`}
				disabled={disabled || index === 0}
				onClick={() => onMove(-1)}
			>
				<ChevronUp aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={`Bajar ${label}`}
				disabled={disabled || index === total - 1}
				onClick={() => onMove(1)}
			>
				<ChevronDown aria-hidden="true" />
			</Button>
		</>
	);
}
