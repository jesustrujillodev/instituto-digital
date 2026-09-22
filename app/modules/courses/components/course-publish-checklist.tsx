import { CircleCheck, CircleDashed } from "lucide-react";
import { useId } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type { CourseModality, PublishCheck } from "../domain/course.rules";
import { publishCheckLabel } from "../utils/course-labels";
import {
	type PublishChecklist,
	stepOfCheck,
	stepOfKey,
	stepPath,
} from "../utils/course-wizard-steps";

const pendingCopy = (pending: number) =>
	pending === 0
		? "Todo listo. Al publicar, el curso aparece a su audiencia."
		: pending === 1
			? "Falta una cosa. El pendiente lleva al paso que la resuelve."
			: `Faltan ${pending} cosas. Cada pendiente lleva al paso que la resuelve.`;

const stepNumberOf = (check: PublishCheck): number =>
	stepOfKey(stepOfCheck(check)).number;

interface CoursePublishChecklistProps {
	documentId: string;
	checklist: PublishChecklist;
	modality: CourseModality;
	className?: string;
}

/**
 * Lo que le falta al borrador para publicarse.
 *
 * Cada pendiente es un enlace al paso del alta que lo resuelve: la lista de la
 * ficha y el índice del alta cuentan el mismo hecho, salido de
 * `publishChecklist()`.
 */
export function CoursePublishChecklist({
	documentId,
	checklist,
	modality,
	className,
}: CoursePublishChecklistProps) {
	const headingId = useId();
	const pending = checklist.filter((entry) => !entry.done).length;

	return (
		<section
			aria-labelledby={headingId}
			className={cn("flex flex-col gap-3", className)}
		>
			<div className="flex flex-col gap-0.5">
				<h2 id={headingId} className="font-medium text-base">
					Para publicar
				</h2>
				<p className="text-muted-foreground text-sm">{pendingCopy(pending)}</p>
			</div>

			<ul className="flex flex-col gap-1">
				{checklist.map(({ check, done }) => {
					const label = publishCheckLabel(check, modality);

					return (
						<li key={check} className="flex items-start gap-2 text-sm">
							{done ? (
								<CircleCheck
									className="mt-2 size-4 shrink-0 text-success-foreground"
									aria-hidden="true"
								/>
							) : (
								<CircleDashed
									className="mt-2 size-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							)}
							{done ? (
								<span className="py-1.5">
									{label}
									<span className="sr-only">: listo</span>
								</span>
							) : (
								<Link
									to={stepPath(documentId, stepNumberOf(check))}
									className="rounded-sm py-1.5 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
								>
									{label}
									<span className="sr-only">: pendiente, ir al paso</span>
								</Link>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
