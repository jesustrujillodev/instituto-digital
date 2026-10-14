import { Download, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { formatZonedDate, formatZonedDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { useFileDownload } from "@/modules/certificates/hooks/use-file-download";
import { myCertificateDownloadUrl } from "@/modules/certificates/utils/certificate-urls";
import { modalityLabelOf } from "@/modules/courses/components/course-card-frame";
import { formatHours } from "@/modules/courses/domain/course.labels";
import { countsContent } from "@/modules/courses/domain/course.rules";
import type {
	AttendanceOutlook,
	MyCourseDigestItem,
	MyCourseInProgress,
	MyCourseInvitation,
	MyCourseUpcoming,
} from "@/modules/enrollments/domain/enrollment-summary.types";
import { RateCourseDialog } from "@/modules/ratings/components/rate-course-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import type { DashboardLearning } from "../domain/dashboard.types";
import { OverflowLink } from "./dashboard-list";
import { DashboardSection } from "./dashboard-section";
import {
	MeterBar,
	TABLE_ROW,
	TableCard,
	TableFooter,
	TableGroup,
} from "./dashboard-table";

const MY_COURSES = "/dashboard/mis-capacitaciones";
const MY_CERTIFICATES = "/dashboard/mis-certificados";
const myCourseHref = (documentId: string) => `${MY_COURSES}/${documentId}`;

const TITLE_LINK =
	"line-clamp-2 rounded-sm font-medium text-foreground text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30";

function ColumnTitle({ title, count }: { title: string; count?: number }) {
	return (
		<h3 className="font-medium text-muted-foreground text-xs">
			{title}
			{count !== undefined && count > 0 && (
				<span className="tabular-nums"> · {count}</span>
			)}
		</h3>
	);
}

function ToRateColumn({
	courses,
	total,
}: {
	courses: MyCourseDigestItem[];
	total: number;
}) {
	const [rating, setRating] = useState<MyCourseDigestItem | null>(null);

	return (
		<div className="flex flex-col gap-3">
			<ColumnTitle title="Por valorar" count={total} />
			{courses.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No tienes capacitaciones por valorar.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{courses.map((course) => (
						<li
							key={course.courseDocumentId}
							className="flex items-center justify-between gap-3"
						>
							<div className="flex min-w-0 flex-col gap-0.5">
								<Link
									to={myCourseHref(course.courseDocumentId)}
									className={TITLE_LINK}
								>
									{course.title}
								</Link>
								<span className="text-muted-foreground text-xs">
									Tu opinión ayuda a mejorarlo.
								</span>
							</div>
							<Button
								size="sm"
								variant="outline"
								className="shrink-0"
								onClick={() => setRating(course)}
							>
								<Star data-icon="inline-start" aria-hidden="true" />
								Valorar
								<span className="sr-only"> «{course.title}»</span>
							</Button>
						</li>
					))}
				</ul>
			)}
			<OverflowLink count={total - courses.length} to={MY_COURSES} />
			{rating && (
				<RateCourseDialog
					courseDocumentId={rating.courseDocumentId}
					courseTitle={rating.title}
					open
					onOpenChange={(open) => {
						if (!open) setRating(null);
					}}
				/>
			)}
		</div>
	);
}

function CertificatesColumn({
	certificates,
}: {
	certificates: DashboardLearning["certificates"];
}) {
	const { download, pending } = useFileDownload();

	return (
		<div className="flex flex-col gap-3">
			<ColumnTitle title="Certificados recientes" />
			{certificates.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Aquí aparecerán los certificados de lo que acredites.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{certificates.map((certificate) => {
						const url = myCertificateDownloadUrl(certificate.documentId, "pdf");

						return (
							<li
								key={certificate.documentId}
								className="flex items-center justify-between gap-3"
							>
								<div className="flex min-w-0 flex-col gap-0.5">
									<Link to={MY_CERTIFICATES} className={TITLE_LINK}>
										{certificate.courseTitle}
									</Link>
									<span className="text-muted-foreground text-xs tabular-nums">
										{certificate.issuedOn} · Folio {certificate.folio}
									</span>
								</div>
								{certificate.downloadable && (
									<Button
										size="icon-sm"
										variant="outline"
										className="shrink-0"
										disabled={pending !== null}
										pending={pending === url}
										onClick={() => download(url, "certificado.pdf")}
										aria-label={`Descargar el certificado de «${certificate.courseTitle}» en PDF`}
									>
										<Download aria-hidden="true" />
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

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

function InProgressRow({ course }: { course: MyCourseInProgress }) {
	const next = course.nextSession;
	const lost = course.attendance !== null && !course.attendance.reachable;
	const href = myCourseHref(course.courseDocumentId);

	return (
		<li
			className={cn(
				TABLE_ROW,
				"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 @xl:grid-cols-[minmax(0,1fr)_minmax(6rem,9rem)_3rem_auto]",
			)}
		>
			<div className="col-span-2 flex min-w-0 flex-col gap-1 @xl:col-span-1">
				<Link to={href} className={TITLE_LINK}>
					{course.title}
				</Link>
				<p className="text-muted-foreground text-xs tabular-nums">
					{[
						modalityLabelOf(course),
						next
							? `Próxima sesión: ${formatZonedDateTime(new Date(next.startsAt))}`
							: null,
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
				{course.attendance && (
					<p
						className={cn(
							"text-xs",
							lost
								? "font-medium text-warning-foreground"
								: "text-muted-foreground",
						)}
					>
						{attendancePhrase(course.attendance)}
					</p>
				)}
			</div>
			{countsContent(course.completionRule) ? (
				<MeterBar
					percent={course.progressPercent}
					complete={course.progressPercent >= 100}
					label={`Avance en el contenido de ${course.title}`}
				/>
			) : (
				<span className="hidden @xl:col-span-2 @xl:block" />
			)}
			<Button
				asChild
				size="sm"
				variant="outline"
				className="col-span-2 @xl:col-span-1"
			>
				<Link to={href}>Continuar</Link>
			</Button>
		</li>
	);
}

const startsPhrase = (course: MyCourseUpcoming) => {
	const { daysToStart, firstSessionAt } = course;
	if (daysToStart === null || !firstSessionAt)
		return "Sin fecha de inicio todavía";
	const date = formatZonedDate(new Date(firstSessionAt));
	if (daysToStart === 0) return `Empieza hoy, ${date}`;
	if (daysToStart === 1) return `Empieza mañana, ${date}`;
	return `Empieza en ${daysToStart} días, el ${date}`;
};

function SimpleRow({
	title,
	href,
	detail,
}: {
	title: string;
	href: string;
	detail: string;
}) {
	return (
		<li
			className={cn(
				TABLE_ROW,
				"flex flex-col gap-1 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-4",
			)}
		>
			<Link to={href} className={TITLE_LINK}>
				{title}
			</Link>
			<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
				{detail}
			</span>
		</li>
	);
}

const invitationDetail = (invitation: MyCourseInvitation) =>
	invitation.closesAt
		? `Responde antes del ${formatZonedDate(new Date(invitation.closesAt))}`
		: invitation.dependencyName;

/**
 * Lo que la persona cursa: sus créditos, lo que tiene por valorar y sus
 * certificados de un vistazo; debajo, lo que está cursando o por empezar.
 */
export function LearningSection({ learning }: { learning: DashboardLearning }) {
	const { courses, invitations, certificates, credits } = learning;
	const { counts } = courses;
	const hasCourses =
		invitations.length > 0 ||
		courses.inProgress.length > 0 ||
		courses.upcoming.length > 0;
	const moreCourses =
		counts.inProgress -
		courses.inProgress.length +
		(counts.upcoming - courses.upcoming.length);

	return (
		<DashboardSection
			title="Tu capacitación"
			description="Lo que tomas tú como participante."
			more={{ label: "Mis capacitaciones", to: MY_COURSES }}
		>
			<Card className="@container gap-0 py-0">
				<div className="grid divide-y @2xl:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)] @2xl:divide-x @2xl:divide-y-0">
					<div className="flex flex-col gap-2 px-5 py-5 @xl:px-6">
						<ColumnTitle title={`Créditos en ${credits.fiscalYear}`} />
						<p className="font-bold text-4xl text-foreground tabular-nums tracking-tight">
							{credits.total}
						</p>
						{credits.hours > 0 && (
							<p className="text-muted-foreground text-xs tabular-nums">
								{formatHours(credits.hours)} acreditadas
							</p>
						)}
					</div>
					<div className="px-5 py-5 @xl:px-6">
						<ToRateColumn courses={courses.toRate} total={counts.toRate} />
					</div>
					<div className="px-5 py-5 @xl:px-6">
						<CertificatesColumn certificates={certificates} />
					</div>
				</div>
			</Card>

			{hasCourses ? (
				<TableCard>
					{invitations.length > 0 && (
						<TableGroup label="Invitaciones">
							{invitations.map((invitation) => (
								<SimpleRow
									key={invitation.courseDocumentId}
									title={invitation.title}
									href={myCourseHref(invitation.courseDocumentId)}
									detail={invitationDetail(invitation)}
								/>
							))}
						</TableGroup>
					)}
					{courses.inProgress.length > 0 && (
						<TableGroup label="En curso">
							{courses.inProgress.map((course) => (
								<InProgressRow key={course.courseDocumentId} course={course} />
							))}
						</TableGroup>
					)}
					{courses.upcoming.length > 0 && (
						<TableGroup label="Por empezar">
							{courses.upcoming.map((course) => (
								<SimpleRow
									key={course.courseDocumentId}
									title={course.title}
									href={myCourseHref(course.courseDocumentId)}
									detail={startsPhrase(course)}
								/>
							))}
						</TableGroup>
					)}
					{moreCourses > 0 && (
						<TableFooter>
							<OverflowLink count={moreCourses} to={MY_COURSES} />
						</TableFooter>
					)}
				</TableCard>
			) : (
				counts.finished === 0 && (
					<div className="flex flex-col gap-3 rounded-2xl bg-card px-5 py-4 text-sm ring-1 ring-foreground/5 sm:flex-row sm:items-center sm:justify-between dark:ring-foreground/10">
						<div className="flex flex-col gap-0.5">
							<p className="font-medium text-foreground">
								Aún no estás inscrito en ninguna capacitación.
							</p>
							<p className="text-muted-foreground">
								En el catálogo están las que tu dependencia y las demás abrieron
								para ti.
							</p>
						</div>
						<Button
							asChild
							size="sm"
							variant="outline"
							className="self-start sm:self-auto"
						>
							<Link to="/dashboard/catalogo-de-capacitaciones">
								Explorar el catálogo
							</Link>
						</Button>
					</div>
				)
			)}
		</DashboardSection>
	);
}
