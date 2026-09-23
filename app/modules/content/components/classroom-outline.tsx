import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import type { LessonProgressStatus } from "../domain/classroom.rules";
import type { ClassroomModule } from "../domain/classroom.types";
import { LESSON_TYPE_LABELS } from "../utils/content-labels";

const STATUS_ICON = {
	COMPLETED: CheckCircle2,
	IN_PROGRESS: CircleDot,
} as const;

const STATUS_LABELS: Record<LessonProgressStatus, string> = {
	COMPLETED: "Completada",
	IN_PROGRESS: "Empezada",
};

function StatusIcon({ status }: { status: LessonProgressStatus | null }) {
	const Icon = status ? STATUS_ICON[status] : Circle;

	return (
		<Icon
			aria-hidden="true"
			className={cn(
				"mt-0.5 size-4 shrink-0",
				status === "COMPLETED" ? "text-primary" : "text-muted-foreground",
			)}
		/>
	);
}

/** El índice del aula: módulos y lecciones con el estado de cada una. */
export function ClassroomOutline({
	courseDocumentId,
	modules,
}: {
	courseDocumentId: string;
	modules: ClassroomModule[];
}) {
	return (
		<nav aria-label="Temario" className="flex flex-col gap-5">
			{modules.map((module, moduleIndex) => (
				<section key={module.documentId} className="flex flex-col gap-1.5">
					<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						{moduleIndex + 1}. {module.title}
					</h2>
					<ol className="flex flex-col gap-0.5">
						{module.lessons.map((lesson) => (
							<li key={lesson.documentId}>
								<NavLink
									to={`/dashboard/mis-cursos/${courseDocumentId}/aula/${lesson.documentId}`}
									className={({ isActive }) =>
										cn(
											"flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
											isActive && "bg-accent font-medium",
										)
									}
								>
									<StatusIcon status={lesson.status} />
									<span className="flex min-w-0 flex-col">
										<span>{lesson.title}</span>
										<span className="text-muted-foreground text-xs">
											{LESSON_TYPE_LABELS[lesson.type]}
											{lesson.isRequired ? "" : " · Opcional"}
											{lesson.status
												? ` · ${STATUS_LABELS[lesson.status]}`
												: ""}
										</span>
									</span>
								</NavLink>
							</li>
						))}
					</ol>
				</section>
			))}
		</nav>
	);
}
