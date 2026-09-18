import {
	ArrowRight,
	Building2,
	CalendarDays,
	Layers,
	User,
} from "lucide-react";
import { formatZonedDate } from "@/lib/date-utils";
import {
	CourseCardFrame,
	type CourseMetaItem,
} from "@/modules/courses/components/course-card-frame";
import type { ViewMode } from "@/shared/view-mode/view-mode";
import type { AvailableCourse } from "../domain/enrollment.types";
import { ENROLLMENT_STATUS_LABELS } from "../utils/enrollment-labels";
import { SeatsBadge } from "./enrollment-badges";

interface CourseCardProps {
	course: AvailableCourse;
	layout: ViewMode;
	/** Las primeras tarjetas cargan su portada sin esperar al scroll. */
	eager?: boolean;
}

export function CourseCard({ course, layout, eager }: CourseCardProps) {
	const trainers =
		course.trainerCount > 1
			? `${course.trainerName} +${course.trainerCount - 1}`
			: course.trainerName;

	const meta: CourseMetaItem[] = [
		{ icon: Building2, label: course.dependencyName, wide: true },
		{
			icon: CalendarDays,
			label: course.firstSessionAt
				? formatZonedDate(new Date(course.firstSessionAt))
				: "Sin fecha",
		},
		{
			icon: Layers,
			label:
				course.sessionCount === 1
					? "1 sesión"
					: `${course.sessionCount} sesiones`,
		},
		...(trainers ? [{ icon: User, label: trainers, wide: true }] : []),
	];

	return (
		<CourseCardFrame
			layout={layout}
			href={`/dashboard/cursos-disponibles/${course.documentId}`}
			course={course}
			highlight={
				course.myStatus ? ENROLLMENT_STATUS_LABELS[course.myStatus] : null
			}
			description={course.description}
			meta={meta}
			eager={eager}
			footer={
				<>
					<SeatsBadge capacity={course.capacity} seatsLeft={course.seatsLeft} />
					{course.closesSoon && course.closesAt && (
						<span className="font-medium text-warning-foreground text-xs">
							Cierra el {formatZonedDate(new Date(course.closesAt))}
						</span>
					)}
				</>
			}
			cta={
				<span className="inline-flex items-center gap-1 font-medium text-primary text-sm">
					Ver curso
					<ArrowRight
						className="size-4 transition-transform duration-200 group-hover/card:translate-x-0.5"
						aria-hidden="true"
					/>
				</span>
			}
		/>
	);
}
