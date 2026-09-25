import {
	Archive,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	CircleAlert,
	ClipboardCheck,
	LayoutList,
	MoreHorizontal,
	Pencil,
	Plus,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useFetcherPromise } from "@/shared/hooks/use-fetcher-promise";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_MAX_MODULES_PER_COURSE,
	CONTENT_TITLE_MAX_LENGTH,
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
import {
	formatMinutes,
	minutesOf,
	outlineStats,
	withLessonMoved,
	withModuleMoved,
} from "../utils/content-outline";
import { ContentModuleDialog } from "./content-module-dialog";
import { LessonEditorSheet } from "./lesson-editor-sheet";
import { LessonTypeIcon } from "./lesson-type-icon";
import { ModuleQuizSheet } from "./module-quiz-sheet";

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

/** "Módulo 3" ya dice su número: no se repite como "Módulo 3 · Módulo 3". */
const moduleHeading = (module: ContentModule, number: number) =>
	/^módulo \d+$/i.test(module.title.trim())
		? `Módulo ${number}`
		: `Módulo ${number} · ${module.title}`;

const moduleMeta = (module: ContentModule) => {
	if (module.lessons.length === 0) {
		return module.quiz ? "Solo evaluación" : "Sin lecciones";
	}
	const minutes = minutesOf(module.lessons);
	return [
		plural(module.lessons.length, "lección", "lecciones"),
		module.quiz && "1 evaluación",
		minutes > 0 && formatMinutes(minutes),
	]
		.filter(Boolean)
		.join(" · ");
};

const lessonMeta = (lesson: ContentLesson) =>
	[
		LESSON_TYPE_LABELS[lesson.type],
		lesson.estimatedMinutes !== null && `${lesson.estimatedMinutes} min`,
		!lesson.isRequired && "Opcional",
	]
		.filter(Boolean)
		.join(" · ");

const ICON_TILE =
	"flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground";

const ROW_BUTTON =
	"flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

interface CourseContentManagerProps {
	courseDocumentId: string;
	tree: CourseContentTree;
	/** Un curso finalizado se consulta, no se edita. */
	canWrite?: boolean;
	/** Controles de quien monta la lista, a la derecha del resumen. */
	actions?: ReactNode;
}

/**
 * El temario como lista: módulos plegables con sus lecciones. Cada lección se
 * abre en un panel lateral; lo demás se guarda en el acto.
 */
export function CourseContentManager({
	courseDocumentId,
	tree,
	canWrite = true,
	actions,
}: CourseContentManagerProps) {
	const mutation = useFetcherPromise<ContentActionData>();
	useFetcherToast(mutation.fetcher);
	const busy = mutation.fetcher.state !== "idle";

	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [addingTo, setAddingTo] = useState<string | null>(null);
	const [editingModule, setEditingModule] = useState<ContentModule | null>(
		null,
	);
	const [openLesson, setOpenLesson] = useState<string | null>(null);
	const [quizModule, setQuizModule] = useState<ContentModule | null>(null);

	const stats = outlineStats(tree);
	const firstWithoutMaterial = tree
		.flatMap((module) => module.lessons)
		.find((lesson) => !lesson.hasMaterial);
	const allCollapsed =
		tree.length > 0 && tree.every((module) => collapsed.has(module.documentId));

	const mutate = (intent: string, payload: unknown, action?: string) =>
		mutation.submit(
			{ [INTENT_FIELD]: intent, [PAYLOAD_FIELD]: JSON.stringify(payload) },
			{ method: "post", action: action ?? contentPath(courseDocumentId) },
		);

	const reorder = (order: ReorderContentDto) =>
		void mutate(CONTENT_INTENTS.reorder, order);

	const setOpen = (documentId: string, open: boolean) =>
		setCollapsed((current) => {
			if (current.has(documentId) !== open) return current;
			const next = new Set(current);
			if (open) next.delete(documentId);
			else next.add(documentId);
			return next;
		});

	const openLessonOf = (lesson: ContentLesson) => {
		const module = tree.find((entry) =>
			entry.lessons.some((item) => item.documentId === lesson.documentId),
		);
		if (module) setOpen(module.documentId, true);
		setOpenLesson(lesson.documentId);
	};

	const startAdding = (moduleDocumentId: string) => {
		setOpen(moduleDocumentId, true);
		setAddingTo(moduleDocumentId);
	};

	const createLesson = async (moduleDocumentId: string, title: string) => {
		const result = await mutate(CONTENT_INTENTS.createLesson, {
			moduleDocumentId,
			title,
			type: "TEXT",
			isRequired: true,
			estimatedMinutes: null,
		});
		return Boolean(result?.success);
	};

	const addModule = () =>
		void mutate(CONTENT_INTENTS.createModule, {
			title: `Módulo ${tree.length + 1}`,
			description: "",
		});

	const closeLesson = useCallback(() => setOpenLesson(null), []);

	const archiveLesson = async (lessonDocumentId: string) => {
		const result = await mutate(CONTENT_INTENTS.archiveLesson, {
			lessonDocumentId,
		});
		if (result?.success && openLesson === lessonDocumentId) setOpenLesson(null);
	};

	if (tree.length === 0) {
		return (
			<div className="flex flex-col gap-4">
				{actions && <div className="flex justify-end">{actions}</div>}
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
							onClick={addModule}
						>
							<Plus aria-hidden="true" />
							Agregar el primer módulo
						</Button>
					)}
				</Empty>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground text-xs tabular-nums">
					{plural(stats.modules, "módulo", "módulos")} ·{" "}
					{plural(stats.lessons, "lección", "lecciones")}
					{stats.minutes > 0 && ` · ${formatMinutes(stats.minutes)}`}
				</p>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() =>
							setCollapsed(
								allCollapsed
									? new Set()
									: new Set(tree.map((module) => module.documentId)),
							)
						}
					>
						{allCollapsed ? "Expandir todo" : "Contraer todo"}
					</Button>
					{actions}
				</div>
			</div>

			{canWrite && firstWithoutMaterial && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warning-foreground/25 bg-warning px-4 py-2.5 text-sm text-warning-foreground">
					<CircleAlert className="size-4 shrink-0" aria-hidden="true" />
					<p className="min-w-0 flex-1">
						{stats.withoutMaterial === 1
							? "1 lección no tiene material todavía. Puedes seguir y completarla después."
							: `${stats.withoutMaterial} lecciones no tienen material todavía. Puedes seguir y completarlas después.`}
					</p>
					<button
						type="button"
						onClick={() => openLessonOf(firstWithoutMaterial)}
						className="rounded font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
					>
						{stats.withoutMaterial === 1
							? "Ir a la lección"
							: "Ir a la primera"}
					</button>
				</div>
			)}

			<ol className="flex flex-col gap-3">
				{tree.map((module, moduleIndex) => {
					const number = moduleIndex + 1;
					const open = !collapsed.has(module.documentId);
					const listId = `modulo-${module.documentId}`;
					const adding = addingTo === module.documentId;
					const full = module.lessons.length >= CONTENT_MAX_LESSONS_PER_MODULE;
					const empty = module.lessons.length === 0 && !module.quiz;

					return (
						<li
							key={module.documentId}
							className="rounded-xl border border-border bg-card"
						>
							<div className="flex items-center gap-2 py-2 pr-2 pl-2">
								<button
									type="button"
									aria-expanded={open}
									aria-controls={listId}
									onClick={() => setOpen(module.documentId, !open)}
									className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
								>
									<ChevronRight
										className={cn(
											"size-4 shrink-0 text-muted-foreground transition-transform duration-150",
											open && "rotate-90",
										)}
										aria-hidden="true"
									/>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-bold text-sm">
											{moduleHeading(module, number)}
										</span>
										{module.description && (
											<span className="truncate text-muted-foreground text-xs">
												{module.description}
											</span>
										)}
									</span>
									<span className="hidden shrink-0 text-muted-foreground text-xs tabular-nums sm:inline">
										{moduleMeta(module)}
									</span>
								</button>

								{canWrite && (
									<RowMenu label={`el módulo ${module.title}`} disabled={busy}>
										<DropdownMenuItem onSelect={() => setEditingModule(module)}>
											<Pencil aria-hidden="true" />
											Editar módulo
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={moduleIndex === 0}
											onSelect={() =>
												reorder(withModuleMoved(tree, moduleIndex, -1))
											}
										>
											<ChevronUp aria-hidden="true" />
											Subir
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={moduleIndex === tree.length - 1}
											onSelect={() =>
												reorder(withModuleMoved(tree, moduleIndex, 1))
											}
										>
											<ChevronDown aria-hidden="true" />
											Bajar
										</DropdownMenuItem>
										<DropdownMenuItem onSelect={() => setQuizModule(module)}>
											<ClipboardCheck aria-hidden="true" />
											{module.quiz
												? "Abrir la evaluación del módulo"
												: "Agregar evaluación del módulo"}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<ArchiveItem
											label="Archivar módulo"
											disabledReason={
												module.lessons.length > 0
													? "Archiva primero sus lecciones"
													: module.quiz
														? "Archiva primero su evaluación"
														: undefined
											}
											onSelect={() =>
												void mutate(CONTENT_INTENTS.archiveModule, {
													moduleDocumentId: module.documentId,
												})
											}
										/>
									</RowMenu>
								)}
							</div>

							{open && (
								<div id={listId} className="flex flex-col gap-1 px-2 pb-3">
									{empty && !adding ? (
										<div className="mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-dashed px-4 py-3">
											<p className="text-muted-foreground text-sm">
												Este módulo aún no tiene lecciones.
											</p>
											{canWrite && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={busy}
													onClick={() => startAdding(module.documentId)}
												>
													<Plus aria-hidden="true" />
													Agregar primera lección
												</Button>
											)}
										</div>
									) : (
										<ul className="flex flex-col gap-0.5">
											{module.lessons.map((lesson, lessonIndex) => (
												<li
													key={lesson.documentId}
													className="flex items-center gap-1"
												>
													<button
														type="button"
														onClick={() => setOpenLesson(lesson.documentId)}
														className={ROW_BUTTON}
													>
														<span className={ICON_TILE}>
															<LessonTypeIcon
																type={lesson.type}
																className="size-4"
															/>
														</span>
														<span className="min-w-0 flex-1 truncate text-sm">
															{number}.{lessonIndex + 1} {lesson.title}
														</span>
														{!lesson.hasMaterial && (
															<Badge className="shrink-0 border-transparent bg-warning text-warning-foreground">
																Sin material
															</Badge>
														)}
														<span className="hidden shrink-0 text-muted-foreground text-xs tabular-nums sm:inline">
															{lessonMeta(lesson)}
														</span>
													</button>

													{canWrite && (
														<RowMenu
															label={`la lección ${lesson.title}`}
															disabled={busy}
														>
															<DropdownMenuItem
																onSelect={() =>
																	setOpenLesson(lesson.documentId)
																}
															>
																<Pencil aria-hidden="true" />
																Editar lección
															</DropdownMenuItem>
															<DropdownMenuItem
																disabled={lessonIndex === 0}
																onSelect={() =>
																	reorder(
																		withLessonMoved(
																			tree,
																			moduleIndex,
																			lessonIndex,
																			-1,
																		),
																	)
																}
															>
																<ChevronUp aria-hidden="true" />
																Subir
															</DropdownMenuItem>
															<DropdownMenuItem
																disabled={
																	lessonIndex === module.lessons.length - 1
																}
																onSelect={() =>
																	reorder(
																		withLessonMoved(
																			tree,
																			moduleIndex,
																			lessonIndex,
																			1,
																		),
																	)
																}
															>
																<ChevronDown aria-hidden="true" />
																Bajar
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<ArchiveItem
																label="Archivar lección"
																onSelect={() =>
																	void archiveLesson(lesson.documentId)
																}
															/>
														</RowMenu>
													)}
												</li>
											))}

											{module.quiz && (
												<li className="flex items-center gap-1">
													<button
														type="button"
														onClick={() => setQuizModule(module)}
														className={ROW_BUTTON}
													>
														<span className={ICON_TILE}>
															<ClipboardCheck
																className="size-4"
																aria-hidden="true"
															/>
														</span>
														<span className="min-w-0 flex-1 truncate text-sm">
															Evaluación del módulo
														</span>
														<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
															{plural(
																module.quiz.questionCount,
																"pregunta",
																"preguntas",
															)}
														</span>
													</button>
													{canWrite && (
														<RowMenu
															label={`la evaluación del módulo ${module.title}`}
															disabled={busy}
														>
															<DropdownMenuItem
																onSelect={() => setQuizModule(module)}
															>
																<Pencil aria-hidden="true" />
																Editar preguntas
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<ArchiveItem
																label="Archivar evaluación del módulo"
																onSelect={() =>
																	void mutate(
																		CONTENT_INTENTS.archiveModuleQuiz,
																		{ moduleDocumentId: module.documentId },
																		quizPath(courseDocumentId),
																	)
																}
															/>
														</RowMenu>
													)}
												</li>
											)}

											{adding && (
												<li>
													<NewLessonRow
														busy={busy}
														onCreate={(title) =>
															createLesson(module.documentId, title)
														}
														onCancel={() => setAddingTo(null)}
													/>
												</li>
											)}
										</ul>
									)}

									{canWrite && !empty && (
										<div className="flex flex-wrap gap-1 pt-1">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												disabled={busy || full || adding}
												onClick={() => startAdding(module.documentId)}
											>
												<Plus aria-hidden="true" />
												Lección
											</Button>
											{!module.quiz && (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													disabled={busy}
													onClick={() => setQuizModule(module)}
												>
													<Plus aria-hidden="true" />
													Evaluación del módulo
												</Button>
											)}
										</div>
									)}
								</div>
							)}
						</li>
					);
				})}
			</ol>

			{canWrite && (
				<Button
					type="button"
					variant="outline"
					disabled={busy || stats.modules >= CONTENT_MAX_MODULES_PER_COURSE}
					onClick={addModule}
					className="h-12 w-full rounded-xl border-dashed bg-transparent"
				>
					<Plus aria-hidden="true" />
					{stats.modules >= CONTENT_MAX_MODULES_PER_COURSE
						? `Máximo ${CONTENT_MAX_MODULES_PER_COURSE} módulos`
						: "Agregar módulo"}
				</Button>
			)}

			<ContentModuleDialog
				open={editingModule !== null}
				onOpenChange={(open) => {
					if (!open) setEditingModule(null);
				}}
				courseDocumentId={courseDocumentId}
				module={editingModule}
			/>

			<LessonEditorSheet
				courseDocumentId={courseDocumentId}
				tree={tree}
				lessonDocumentId={openLesson}
				canWrite={canWrite}
				busy={busy}
				onNavigate={setOpenLesson}
				onClose={closeLesson}
				onArchive={(lessonDocumentId) => void archiveLesson(lessonDocumentId)}
			/>

			<ModuleQuizSheet
				open={quizModule !== null}
				onOpenChange={(open) => {
					if (!open) setQuizModule(null);
				}}
				courseDocumentId={courseDocumentId}
				module={quizModule}
				canWrite={canWrite}
			/>
		</div>
	);
}

function RowMenu({
	label,
	disabled,
	children,
}: {
	label: string;
	disabled: boolean;
	children: ReactNode;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Acciones de ${label}`}
					disabled={disabled}
					className="shrink-0 text-muted-foreground"
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ArchiveItem({
	label,
	disabledReason,
	onSelect,
}: {
	label: string;
	disabledReason?: string;
	onSelect: () => void;
}) {
	return (
		<DropdownMenuItem
			variant="destructive"
			disabled={Boolean(disabledReason)}
			onSelect={onSelect}
		>
			<Archive aria-hidden="true" />
			<span className="flex flex-col">
				{label}
				{disabledReason && (
					<span className="font-normal text-muted-foreground text-xs">
						{disabledReason}
					</span>
				)}
			</span>
		</DropdownMenuItem>
	);
}

/**
 * La lección se nombra en la propia lista. Queda abierta tras crear para
 * encadenar varias; Esc o salir con el campo vacío la cierran.
 */
function NewLessonRow({
	busy,
	onCreate,
	onCancel,
}: {
	busy: boolean;
	onCreate: (title: string) => Promise<boolean>;
	onCancel: () => void;
}) {
	const [title, setTitle] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const submit = async () => {
		const value = title.trim();
		if (value === "" || busy) return;
		if (await onCreate(value)) {
			setTitle("");
			inputRef.current?.focus();
		}
	};

	return (
		<div className="flex items-center gap-3 rounded-lg border border-primary/60 px-2 py-1.5 ring-3 ring-primary/10">
			<span className={ICON_TILE}>
				<Plus className="size-4" aria-hidden="true" />
			</span>
			<input
				ref={inputRef}
				aria-label="Nombre de la lección nueva"
				placeholder="Nombre de la lección"
				value={title}
				maxLength={CONTENT_TITLE_MAX_LENGTH}
				disabled={busy}
				onChange={(event) => setTitle(event.target.value)}
				onKeyDown={(event) => {
					// Dentro del wizard, Enter también enviaría su formulario.
					if (event.key === "Enter") {
						event.preventDefault();
						void submit();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				}}
				onBlur={() => {
					if (title.trim() === "" && !busy) onCancel();
				}}
				className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
			/>
			<span className="hidden shrink-0 text-muted-foreground text-xs sm:inline">
				Enter para crear · Esc para cancelar
			</span>
		</div>
	);
}
