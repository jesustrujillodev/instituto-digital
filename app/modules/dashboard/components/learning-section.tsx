import { BookOpen, Star } from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate, formatZonedDateTime } from "@/lib/date-utils";
import { ProgressBar } from "@/modules/content/components/progress-bar";
import { modalityLabelOf } from "@/modules/courses/components/course-card-frame";
import { formatHours } from "@/modules/courses/domain/course.labels";
import { countsContent } from "@/modules/courses/domain/course.rules";
import type {
	AttendanceOutlook,
	MyCourseInProgress,
} from "@/modules/enrollments/domain/enrollment-summary.types";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { DashboardLearning } from "../domain/dashboard.types";
import {
	DashboardList,
	DashboardListItem,
	OverflowLink,
} from "./dashboard-list";
import { DashboardSection } from "./dashboard-section";

const MY_COURSES = "/dashboard/mis-capacitaciones";
const myCourseHref = (documentId: string) => `${MY_COURSES}/${documentId}`;

/** Cuánta asistencia falta, dicho como lo que todavía se puede hacer. */
const attendancePhrase = (outlook: AttendanceOutlook) => {
	if (outlook.needed === 0) return "Ya cumples la asistencia mínima.";
	if (!outlook.reachable) {
		return `Ya no alcanzas la asistencia mínima: necesitas ${outlook.needed} y quedan ${outlook.remaining}.`;
	}
	const sessions =
		outlook.needed === 1 ? "1 sesión más" : `${outlook.needed} sesiones más`;
	return `Te falta asistir a ${sessions}; quedan ${outlook.remaining}.`;
};

function InProgressItem({ course }: { course: MyCourseInProgress }) {
	const next = course.nextSession;

	return (
		<DashboardListItem
			title={course.title}
			href={myCourseHref(course.courseDocumentId)}
			meta={[
				modalityLabelOf(course),
				next
					? `Próxima sesión: ${formatZonedDateTime(new Date(next.startsAt))}`
					: null,
			]
				.filter(Boolean)
				.join(" · ")}
			note={course.attendance ? attendancePhrase(course.attendance) : undefined}
			tone={
				course.attendance && !course.attendance.reachable
					? "warning"
					: "neutral"
			}
			action={
				<Button asChild size="sm" variant="outline">
					<Link to={myCourseHref(course.courseDocumentId)}>Continuar</Link>
				</Button>
			}
		>
			{countsContent(course.completionRule) && (
				<div className="flex items-center gap-2 pt-1">
					<ProgressBar
						value={course.progressPercent}
						label={`Avance en el contenido de ${course.title}`}
						className="max-w-56"
					/>
					<span className="text-muted-foreground text-xs tabular-nums">
						{course.progressPercent} %
					</span>
				</div>
			)}
		</DashboardListItem>
	);
}

const startsPhrase = (
	daysToStart: number | null,
	firstSessionAt: Date | null,
) => {
	if (daysToStart === null || !firstSessionAt)
		return "Sin fecha de inicio todavía";
	const date = formatZonedDate(new Date(firstSessionAt));
	if (daysToStart === 0) return `Empieza hoy, ${date}`;
	if (daysToStart === 1) return `Empieza mañana, ${date}`;
	return `Empieza en ${daysToStart} días, el ${date}`;
};

function SideList({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<h3 className="font-medium text-sm">{title}</h3>
			{children}
		</div>
	);
}

export function LearningSection({ learning }: { learning: DashboardLearning }) {
	const { courses, invitations, certificates, credits } = learning;
	const { counts } = courses;
	const hasMain = courses.inProgress.length > 0 || courses.upcoming.length > 0;
	const hasSide =
		invitations.length > 0 ||
		courses.toRate.length > 0 ||
		certificates.length > 0;

	const creditsLine =
		credits.total === 0
			? `Aún no tienes créditos en ${credits.fiscalYear}.`
			: `${credits.total} ${credits.total === 1 ? "crédito" : "créditos"} en ${credits.fiscalYear}${credits.hours > 0 ? ` · ${formatHours(credits.hours)}` : ""}.`;

	return (
		<DashboardSection
			title="Tu capacitación"
			description={creditsLine}
			more={{ label: "Mis capacitaciones", to: MY_COURSES }}
		>
			{!hasMain && !hasSide ? (
				<Card size="sm">
					<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-start gap-3">
							<BookOpen
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<div className="flex flex-col gap-0.5">
								<p className="font-medium text-sm">
									{counts.finished > 0
										? "No tienes capacitaciones en curso."
										: "Aún no estás inscrito en ninguna capacitación."}
								</p>
								<p className="text-muted-foreground text-sm">
									En el catálogo están las que tu dependencia y las demás
									abrieron para ti.
								</p>
							</div>
						</div>
						<Button asChild size="sm" variant="outline">
							<Link to="/dashboard/catalogo-de-capacitaciones">
								Explorar el catálogo
							</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
					{hasMain && (
						<Card className={hasSide ? undefined : "lg:col-span-2"}>
							<CardContent className="flex flex-col gap-6">
								{courses.inProgress.length > 0 && (
									<SideList title="En curso">
										<DashboardList>
											{courses.inProgress.map((course) => (
												<InProgressItem
													key={course.courseDocumentId}
													course={course}
												/>
											))}
										</DashboardList>
										<OverflowLink
											count={counts.inProgress - courses.inProgress.length}
											to={MY_COURSES}
										/>
									</SideList>
								)}
								{courses.upcoming.length > 0 && (
									<SideList title="Por empezar">
										<DashboardList>
											{courses.upcoming.map((course) => (
												<DashboardListItem
													key={course.courseDocumentId}
													title={course.title}
													href={myCourseHref(course.courseDocumentId)}
													meta={startsPhrase(
														course.daysToStart,
														course.firstSessionAt,
													)}
												/>
											))}
										</DashboardList>
										<OverflowLink
											count={counts.upcoming - courses.upcoming.length}
											to={MY_COURSES}
										/>
									</SideList>
								)}
							</CardContent>
						</Card>
					)}

					{hasSide && (
						<Card size="sm" className={hasMain ? undefined : "lg:col-span-2"}>
							<CardContent className="flex flex-col gap-5">
								{invitations.length > 0 && (
									<SideList title="Invitaciones">
										<DashboardList>
											{invitations.map((invitation) => (
												<DashboardListItem
													key={invitation.courseDocumentId}
													title={invitation.title}
													href={myCourseHref(invitation.courseDocumentId)}
													meta={
														invitation.closesAt
															? `Responde antes del ${formatZonedDate(new Date(invitation.closesAt))}`
															: invitation.dependencyName
													}
												/>
											))}
										</DashboardList>
									</SideList>
								)}
								{courses.toRate.length > 0 && (
									<SideList title="Por valorar">
										<DashboardList>
											{courses.toRate.map((course) => (
												<DashboardListItem
													key={course.courseDocumentId}
													leading={
														<Star
															className="mt-0.5 size-4 shrink-0 text-muted-foreground"
															aria-hidden="true"
														/>
													}
													title={course.title}
													href={myCourseHref(course.courseDocumentId)}
													meta="Tu valoración ayuda a mejorar el curso."
												/>
											))}
										</DashboardList>
										<OverflowLink
											count={counts.toRate - courses.toRate.length}
											to={MY_COURSES}
										/>
									</SideList>
								)}
								{certificates.length > 0 && (
									<SideList title="Certificados recientes">
										<DashboardList>
											{certificates.map((certificate) => (
												<DashboardListItem
													key={certificate.documentId}
													title={certificate.courseTitle}
													href="/dashboard/mis-certificados"
													meta={`Emitido el ${certificate.issuedOn} · Folio ${certificate.folio}`}
												/>
											))}
										</DashboardList>
									</SideList>
								)}
							</CardContent>
						</Card>
					)}
				</div>
			)}
		</DashboardSection>
	);
}
