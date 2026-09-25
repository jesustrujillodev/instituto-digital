import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/shared/components/ui/card";
import { countsAttendance, requiresSessions } from "../domain/course.rules";
import type { CourseDetail } from "../domain/course.types";
import {
	COMPLETION_RULE_LABELS,
	courseHoursLabel,
	EVALUATION_METHOD_LABELS,
} from "../utils/course-labels";

const dateOf = (value: Date | string) => formatZonedDate(new Date(value));

/**
 * Las reglas con las que corre el curso y su procedencia.
 *
 * Cupo y cierre solo se muestran en borrador: después los lleva el panel de
 * inscripción, ya resueltos (lugares libres, fecha real de cierre).
 */
export function CourseFacts({
	course,
	className,
}: {
	course: CourseDetail;
	className?: string;
}) {
	const facts: { term: string; value: React.ReactNode }[] = [];
	const scheduled = requiresSessions(course.format);

	if (course.status === "DRAFT") {
		facts.push(
			{
				term: "Cupo",
				value:
					course.capacity === null
						? "Sin límite"
						: `${course.capacity} lugares`,
			},
			{
				term: "Cierre de inscripción",
				value: course.enrollmentDeadline
					? dateOf(course.enrollmentDeadline)
					: "Al iniciar la primera sesión",
			},
		);
	}

	facts.push({ term: "Duración", value: courseHoursLabel(course) });

	facts.push({
		term: "Se completa con",
		value: COMPLETION_RULE_LABELS[course.completionRule],
	});

	if (countsAttendance(course.completionRule)) {
		facts.push({
			term: "Asistencia mínima",
			value: `${course.minAttendance} %`,
		});
	}

	facts.push({
		term: "Evaluación final",
		value: course.requiresEvaluation
			? EVALUATION_METHOD_LABELS[course.evaluationMethod]
			: "Sin evaluación",
	});

	if (scheduled) {
		facts.push({
			term: "QR de asistencia",
			value: `Abre ${course.qrOpensBeforeMinutes} min antes y cierra ${course.qrClosesAfterMinutes} min después de cada sesión`,
		});
	}

	if (course.planLine) {
		facts.push({
			term: "Plan anual",
			value: (
				<Link
					to={`/dashboard/plan-anual/${course.planLine.planDocumentId}`}
					className="text-primary underline-offset-4 hover:underline"
				>
					{course.planLine.title}
				</Link>
			),
		});
	}

	facts.push({
		term: "Creado",
		value: course.createdByName
			? `${dateOf(course.createdAt)} por ${course.createdByName}`
			: dateOf(course.createdAt),
	});

	if (course.publishedAt) {
		facts.push({ term: "Publicado", value: dateOf(course.publishedAt) });
	}

	return (
		<Card size="sm" className={cn(className)}>
			<CardContent className="flex flex-col gap-3">
				<h2 className="font-medium text-base">Detalles</h2>
				<dl className="flex flex-col gap-3">
					{facts.map(({ term, value }) => (
						<div key={term} className="flex flex-col gap-0.5">
							<dt className="text-muted-foreground text-xs">{term}</dt>
							<dd className="text-sm">{value}</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}
