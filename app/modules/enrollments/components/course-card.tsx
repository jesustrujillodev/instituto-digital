import { CalendarDays, Clock, User, Users } from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
	CourseCardFrame,
	CourseCardStatus,
	type CourseMetaItem,
} from "@/modules/courses/components/course-card-frame";
import { requiresSessions } from "@/modules/courses/domain/course.rules";
import { Button } from "@/shared/components/ui/button";
import type { ViewMode } from "@/shared/view-mode/view-mode";
import type { AvailableCourse } from "../domain/enrollment.types";
import { ENROLLMENT_STATUS_LABELS } from "../utils/enrollment-labels";

interface CourseCardProps {
	course: AvailableCourse;
	layout: ViewMode;
	/** Las primeras tarjetas cargan su portada sin esperar al scroll. */
	eager?: boolean;
}

const seatsOf = ({ capacity, seatsLeft }: AvailableCourse) => {
	if (capacity === null || seatsLeft === null) return "Sin cupo límite";
	if (seatsLeft === 0) return "Sin lugares";
	return seatsLeft === 1 ? "Queda 1 lugar" : `Quedan ${seatsLeft} lugares`;
};

export function CourseCard({ course, layout, eager }: CourseCardProps) {
	const href = `/dashboard/catalogo-de-capacitaciones/${course.documentId}`;
	const trainers =
		course.trainerCount > 1
			? `${course.trainerName} +${course.trainerCount - 1}`
			: course.trainerName;
	const full = course.capacity !== null && course.seatsLeft === 0;

	const meta: CourseMetaItem[] = [
		...(requiresSessions(course.format)
			? [
					{
						icon: CalendarDays,
						label: [
							course.firstSessionAt
								? formatZonedDate(new Date(course.firstSessionAt))
								: "Sin fecha",
							course.sessionCount === 1
								? "1 sesión"
								: `${course.sessionCount} sesiones`,
						].join(" · "),
					},
				]
			: []),
		...(trainers ? [{ icon: User, label: trainers, wide: true }] : []),
	];

	return (
		<CourseCardFrame
			layout={layout}
			href={href}
			course={course}
			highlight={
				course.myStatus ? ENROLLMENT_STATUS_LABELS[course.myStatus] : null
			}
			description={course.description}
			meta={meta}
			eager={eager}
			status={
				<div
					className={cn(
						"flex flex-col gap-1",
						layout === "list" && "md:items-end",
					)}
				>
					<CourseCardStatus icon={Users} tone={full ? "muted" : "neutral"}>
						{seatsOf(course)}
					</CourseCardStatus>
					{course.closesSoon && course.closesAt && (
						<CourseCardStatus icon={Clock} tone="warning">
							Cierra el {formatZonedDate(new Date(course.closesAt))}
						</CourseCardStatus>
					)}
				</div>
			}
			actions={
				<Button variant="outline" asChild>
					<Link to={href}>Ver detalles</Link>
				</Button>
			}
		/>
	);
}
