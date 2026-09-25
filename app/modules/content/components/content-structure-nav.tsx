import { ChevronRight, CircleCheck, ClipboardCheck, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import {
	CONTENT_MAX_LESSONS_PER_MODULE,
	CONTENT_MAX_MODULES_PER_COURSE,
} from "../domain/content.config";
import type { CourseContentTree } from "../domain/content.types";
import {
	formatMinutes,
	isSameSelection,
	minutesOf,
	type OutlineSelection,
	outlineStats,
} from "../utils/content-outline";
import { LessonTypeIcon } from "./lesson-type-icon";

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

const ROW =
	"flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

/**
 * La estructura del temario: módulos plegables con sus lecciones y su
 * evaluación. Seleccionar abre el elemento a la derecha.
 */
export function ContentStructureNav({
	tree,
	selection,
	onSelect,
	onAddModule,
	onAddLesson,
	canWrite,
	busy,
	liveTitle,
}: {
	tree: CourseContentTree;
	selection: OutlineSelection | null;
	onSelect: (selection: OutlineSelection) => void;
	onAddModule: () => void;
	onAddLesson: (moduleDocumentId: string) => void;
	canWrite: boolean;
	busy: boolean;
	/** El título que se está escribiendo a la derecha, antes de guardarse. */
	liveTitle: string | null;
}) {
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const stats = outlineStats(tree);

	// Lo que se abre —una lección recién creada, la siguiente con ›— nunca
	// queda escondido en un módulo plegado.
	const openModuleId =
		selection?.kind === "lesson"
			? tree.find((module) =>
					module.lessons.some(
						(lesson) => lesson.documentId === selection.documentId,
					),
				)?.documentId
			: selection?.kind === "quiz"
				? selection.moduleDocumentId
				: undefined;

	useEffect(() => {
		if (!openModuleId) return;
		setCollapsed((current) => {
			if (!current.has(openModuleId)) return current;
			const next = new Set(current);
			next.delete(openModuleId);
			return next;
		});
	}, [openModuleId]);

	const toggle = (documentId: string) =>
		setCollapsed((current) => {
			const next = new Set(current);
			if (next.has(documentId)) next.delete(documentId);
			else next.add(documentId);
			return next;
		});

	const titleOf = (target: OutlineSelection, title: string) =>
		liveTitle !== null && isSameSelection(target, selection) && liveTitle.trim()
			? liveTitle
			: title;

	return (
		<nav
			aria-label="Estructura del temario"
			className="flex min-h-0 flex-col border-border lg:border-r"
		>
			<header className="flex items-start justify-between gap-3 border-border border-b px-4 py-3.5">
				<div className="flex min-w-0 flex-col">
					<h3 className="font-bold text-sm">Estructura</h3>
					<p className="text-muted-foreground text-xs tabular-nums">
						{plural(stats.modules, "módulo", "módulos")} ·{" "}
						{plural(stats.lessons, "lección", "lecciones")}
						{stats.minutes > 0 && ` · ${formatMinutes(stats.minutes)}`}
					</p>
				</div>
				{canWrite && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={busy || stats.modules >= CONTENT_MAX_MODULES_PER_COURSE}
						onClick={onAddModule}
					>
						<Plus aria-hidden="true" />
						Módulo
					</Button>
				)}
			</header>

			<ol className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
				{tree.map((module, moduleIndex) => {
					const number = moduleIndex + 1;
					const open = !collapsed.has(module.documentId);
					const moduleTarget: OutlineSelection = {
						kind: "module",
						documentId: module.documentId,
					};
					const quizTarget: OutlineSelection = {
						kind: "quiz",
						moduleDocumentId: module.documentId,
					};
					const minutes = minutesOf(module.lessons);
					const listId = `modulo-${module.documentId}`;

					return (
						<li
							key={module.documentId}
							className="border-border border-t py-1 first:border-t-0"
						>
							<div className="flex items-center gap-0.5">
								<button
									type="button"
									aria-expanded={open}
									aria-controls={listId}
									aria-label={`${open ? "Plegar" : "Desplegar"} el módulo ${module.title}`}
									onClick={() => toggle(module.documentId)}
									className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
								>
									<ChevronRight
										className={cn(
											"size-4 transition-transform duration-150",
											open && "rotate-90",
										)}
										aria-hidden="true"
									/>
								</button>
								<button
									type="button"
									aria-current={
										isSameSelection(moduleTarget, selection)
											? "true"
											: undefined
									}
									onClick={() => onSelect(moduleTarget)}
									className={cn(
										ROW,
										"px-1.5 font-bold",
										isSameSelection(moduleTarget, selection)
											? "bg-primary/10"
											: "hover:bg-muted",
									)}
								>
									<span className="min-w-0 flex-1 truncate">
										{number} · {titleOf(moduleTarget, module.title)}
									</span>
									<span className="shrink-0 font-normal text-muted-foreground text-xs tabular-nums">
										{module.lessons.length === 0
											? "Vacío"
											: minutes > 0
												? formatMinutes(minutes)
												: plural(module.lessons.length, "lección", "lecciones")}
									</span>
								</button>
							</div>

							{open && (
								<ul id={listId} className="flex flex-col gap-0.5 py-1 pl-5">
									{module.lessons.map((lesson, lessonIndex) => {
										const target: OutlineSelection = {
											kind: "lesson",
											documentId: lesson.documentId,
										};
										const selected = isSameSelection(target, selection);

										return (
											<li key={lesson.documentId}>
												<button
													type="button"
													aria-current={selected ? "true" : undefined}
													onClick={() => onSelect(target)}
													className={cn(
														ROW,
														selected
															? "bg-primary/10 font-medium text-foreground"
															: "text-muted-foreground hover:bg-muted hover:text-foreground",
													)}
												>
													<LessonTypeIcon
														type={lesson.type}
														className={cn(
															"size-4 shrink-0",
															selected && "text-primary",
														)}
													/>
													<span className="min-w-0 flex-1 truncate">
														{number}.{lessonIndex + 1}{" "}
														{titleOf(target, lesson.title)}
													</span>
													{!lesson.hasMaterial && (
														<span
															className="size-2 shrink-0 rounded-full bg-warning-foreground"
															title="Sin material"
														>
															<span className="sr-only">(sin material)</span>
														</span>
													)}
												</button>
											</li>
										);
									})}

									{(module.quiz || isSameSelection(quizTarget, selection)) && (
										<li>
											<button
												type="button"
												aria-current={
													isSameSelection(quizTarget, selection)
														? "true"
														: undefined
												}
												onClick={() => onSelect(quizTarget)}
												className={cn(
													ROW,
													isSameSelection(quizTarget, selection)
														? "bg-primary/10 font-medium text-foreground"
														: "text-muted-foreground hover:bg-muted hover:text-foreground",
												)}
											>
												<ClipboardCheck
													className="size-4 shrink-0 text-success-foreground"
													aria-hidden="true"
												/>
												<span className="min-w-0 flex-1 truncate">
													Evaluación del módulo
												</span>
											</button>
										</li>
									)}

									{canWrite &&
										module.lessons.length < CONTENT_MAX_LESSONS_PER_MODULE && (
											<li>
												<button
													type="button"
													disabled={busy}
													onClick={() => onAddLesson(module.documentId)}
													className={cn(
														ROW,
														"text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
													)}
												>
													<Plus
														className="size-4 shrink-0"
														aria-hidden="true"
													/>
													Agregar lección
												</button>
											</li>
										)}
								</ul>
							)}
						</li>
					);
				})}
			</ol>

			{stats.lessons > 0 && (
				<footer className="flex items-center gap-2 border-border border-t px-4 py-3 text-xs">
					{stats.withoutMaterial > 0 ? (
						<>
							<span
								className="size-2 shrink-0 rounded-full bg-warning-foreground"
								aria-hidden="true"
							/>
							<span className="text-warning-foreground">
								{plural(
									stats.withoutMaterial,
									"lección sin material",
									"lecciones sin material",
								)}
							</span>
						</>
					) : (
						<>
							<CircleCheck
								className="size-3.5 shrink-0 text-success-foreground"
								aria-hidden="true"
							/>
							<span className="text-muted-foreground">
								Todas las lecciones tienen material
							</span>
						</>
					)}
				</footer>
			)}
		</nav>
	);
}
