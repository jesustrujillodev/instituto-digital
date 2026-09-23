import {
	CheckCircle2,
	Circle,
	CircleDot,
	ClipboardCheck,
	Lock,
} from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import type { LessonProgressStatus } from "../domain/classroom.rules";
import type { ClassroomModule, ClassroomView } from "../domain/classroom.types";
import { examPath } from "../utils/content-form";
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
const finalQuizNote = (quiz: NonNullable<ClassroomView["finalQuiz"]>) => {
	switch (quiz.availability) {
		case "TAKEN":
			return `Presentado · ${quiz.score} · ${quiz.passed ? "aprobado" : "no aprobado"}`;
		case "LOCKED_BY_CONTENT":
			return "Se habilita al terminar las lecciones obligatorias";
		case "AVAILABLE":
			return "Disponible · un solo intento";
	}
};

export function ClassroomOutline({
	courseDocumentId,
	modules,
	finalQuiz,
}: {
	courseDocumentId: string;
	modules: ClassroomModule[];
	finalQuiz: ClassroomView["finalQuiz"];
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

			{finalQuiz && (
				<section className="flex flex-col gap-1.5">
					<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Evaluación
					</h2>
					<NavLink
						to={examPath(courseDocumentId)}
						className={({ isActive }) =>
							cn(
								"flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
								isActive && "bg-accent font-medium",
							)
						}
					>
						{finalQuiz.availability === "LOCKED_BY_CONTENT" ? (
							<Lock
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
							/>
						) : (
							<ClipboardCheck
								aria-hidden="true"
								className={cn(
									"mt-0.5 size-4 shrink-0",
									finalQuiz.availability === "TAKEN"
										? "text-primary"
										: "text-muted-foreground",
								)}
							/>
						)}
						<span className="flex min-w-0 flex-col">
							<span>{finalQuiz.title}</span>
							<span className="text-muted-foreground text-xs">
								{finalQuizNote(finalQuiz)}
							</span>
						</span>
					</NavLink>
				</section>
			)}
		</nav>
	);
}
