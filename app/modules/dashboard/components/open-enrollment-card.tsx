import { formatZonedDate } from "@/lib/date-utils";
import type {
	OpenEnrollmentRow,
	OpenEnrollmentSummary,
} from "@/modules/enrollments/domain/enrollment-summary.types";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import {
	DashboardList,
	DashboardListItem,
	OverflowLink,
} from "./dashboard-list";

const COURSES = "/dashboard/capacitaciones";

/** «1 inscrito», pero «1 de 20 inscritos»: con cupo, el sustantivo va con el total. */
const enrolledWord = (enrolled: number, capacity: number | null) =>
	(capacity ?? enrolled) === 1 ? "inscrito" : "inscritos";

const startsPhrase = (days: number) =>
	days === 0
		? "Empieza hoy"
		: days === 1
			? "Empieza mañana"
			: `Empieza en ${days} días`;

function enrollmentNote(course: OpenEnrollmentRow) {
	if (course.lowEnrollment && course.startsInDays !== null) {
		const seats = course.capacity === null ? "" : ` de ${course.capacity}`;
		return `${startsPhrase(course.startsInDays)} con ${course.enrolled}${seats} ${enrolledWord(course.enrolled, course.capacity)}.`;
	}
	return course.closesAt
		? `La inscripción cierra el ${formatZonedDate(new Date(course.closesAt))}.`
		: "Inscripción abierta mientras siga publicado.";
}

function SeatsBar({ course }: { course: OpenEnrollmentRow }) {
	if (course.capacity === null) {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">
				{course.enrolled} {enrolledWord(course.enrolled, null)} · sin cupo
			</span>
		);
	}
	const percent = Math.min(
		100,
		Math.round((course.enrolled / course.capacity) * 100),
	);

	return (
		<div className="flex items-center gap-2">
			<div
				role="progressbar"
				aria-label={`Lugares ocupados en ${course.title}`}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-primary"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<span className="text-muted-foreground text-xs tabular-nums">
				{course.enrolled} de {course.capacity}
			</span>
		</div>
	);
}

/** Los cursos con la inscripción abierta, lo que cierra antes primero. */
export function OpenEnrollmentCard({
	summary,
}: {
	summary: OpenEnrollmentSummary;
}) {
	return (
		<Card className="lg:col-span-2">
			<CardHeader>
				<h3 className="font-medium text-base">Inscripción abierta</h3>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{summary.courses.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Ningún curso tiene la inscripción abierta ahora.
					</p>
				) : (
					<DashboardList>
						{summary.courses.map((course) => (
							<DashboardListItem
								key={course.documentId}
								title={course.title}
								href={`${COURSES}/${course.documentId}/inscripciones`}
								note={enrollmentNote(course)}
								tone={
									course.lowEnrollment || course.closesSoon
										? "warning"
										: "neutral"
								}
								action={
									course.invited > 0 ? (
										<span className="text-muted-foreground text-xs tabular-nums sm:text-right">
											{course.invited === 1
												? "1 invitación sin responder"
												: `${course.invited} invitaciones sin responder`}
										</span>
									) : undefined
								}
							>
								<SeatsBar course={course} />
							</DashboardListItem>
						))}
					</DashboardList>
				)}
				<OverflowLink
					count={summary.total - summary.courses.length}
					to={`${COURSES}?status=PUBLISHED`}
				/>
			</CardContent>
		</Card>
	);
}
