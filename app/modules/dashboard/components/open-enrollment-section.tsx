import { Clock, DoorOpen } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type {
	OpenEnrollmentRow,
	OpenEnrollmentSummary,
} from "@/modules/enrollments/domain/enrollment-summary.types";
import { Card } from "@/shared/components/ui/card";
import { closingPhrase } from "../utils/dashboard-dates";
import { OverflowLink } from "./dashboard-list";
import { DashboardSection, EmptyNote } from "./dashboard-section";

const COURSES = "/dashboard/capacitaciones";

/** Las columnas solo se abren con espacio; en angosto cada curso es un bloque. */
const COLUMNS =
	"@xl:grid @xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] @xl:items-center @xl:gap-x-6";

const startsPhrase = (days: number) =>
	days === 0
		? "Empieza hoy"
		: days === 1
			? "Empieza mañana"
			: `Empieza en ${days} días`;

function Chip({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex h-5 items-center rounded-lg bg-muted px-2 font-medium text-foreground text-xs">
			{children}
		</span>
	);
}

function EnrollmentRow({
	course,
	today,
}: {
	course: OpenEnrollmentRow;
	today: string;
}) {
	const full = course.capacity !== null && course.enrolled >= course.capacity;

	return (
		<li className={cn("flex flex-col gap-1.5 px-5 py-4 @xl:px-6", COLUMNS)}>
			<div className="flex min-w-0 flex-col gap-0.5">
				<Link
					to={`${COURSES}/${course.documentId}/inscripciones`}
					className="line-clamp-2 rounded-sm font-medium text-foreground text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					{course.title}
				</Link>
				{course.invited > 0 && (
					<span className="text-muted-foreground text-xs tabular-nums">
						{course.invited === 1
							? "1 invitación sin responder"
							: `${course.invited} invitaciones sin responder`}
					</span>
				)}
			</div>
			<p
				className={cn(
					"flex items-center gap-1.5 text-xs tabular-nums",
					course.closesSoon
						? "font-medium text-warning-foreground"
						: "text-muted-foreground",
				)}
			>
				{course.closesSoon && (
					<Clock className="size-3.5 shrink-0" aria-hidden="true" />
				)}
				<span className="sr-only">Cierre: </span>
				{course.closesAt
					? closingPhrase(new Date(course.closesAt), today)
					: "Mientras esté publicada"}
			</p>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
				<span className="sr-only">Inscritos: </span>
				{course.capacity === null ? (
					<span className="text-foreground">
						{course.enrolled}
						<span className="text-muted-foreground"> · sin límite</span>
					</span>
				) : (
					<span className="text-foreground">
						{course.enrolled} de {course.capacity}
					</span>
				)}
				{full && <Chip>Cupo lleno</Chip>}
				{course.lowEnrollment && course.startsInDays !== null && (
					<span className="font-medium text-warning-foreground text-xs">
						{startsPhrase(course.startsInDays)}
					</span>
				)}
			</div>
		</li>
	);
}

/** Los cursos con la inscripción abierta, lo que cierra antes primero. */
export function OpenEnrollmentSection({
	summary,
	today,
}: {
	summary: OpenEnrollmentSummary;
	today: string;
}) {
	const overflow = summary.total - summary.courses.length;

	return (
		<DashboardSection
			title="Inscripciones abiertas"
			count={{ value: summary.total, noun: ["curso", "cursos"] }}
			more={{ label: "Ver capacitaciones", to: COURSES }}
		>
			{summary.courses.length === 0 ? (
				<EmptyNote icon={DoorOpen}>
					Ningún curso tiene la inscripción abierta ahora.
				</EmptyNote>
			) : (
				<Card className="@container gap-0 py-0">
					<div
						aria-hidden="true"
						className={cn(
							"hidden border-b px-6 py-3 text-muted-foreground text-xs",
							COLUMNS,
						)}
					>
						<span>Capacitación</span>
						<span>Cierre</span>
						<span>Inscritos</span>
					</div>
					<ul
						aria-label="Cursos con inscripción abierta"
						className="flex flex-col divide-y"
					>
						{summary.courses.map((course) => (
							<EnrollmentRow
								key={course.documentId}
								course={course}
								today={today}
							/>
						))}
					</ul>
					{overflow > 0 && (
						<div className="border-t px-5 py-3 @xl:px-6">
							<OverflowLink
								count={overflow}
								to={`${COURSES}?status=PUBLISHED`}
							/>
						</div>
					)}
				</Card>
			)}
		</DashboardSection>
	);
}
