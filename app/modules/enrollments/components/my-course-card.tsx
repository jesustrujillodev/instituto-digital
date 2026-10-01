import type { LucideIcon } from "lucide-react";
import {
	ArrowRight,
	CalendarDays,
	CircleCheck,
	CircleMinus,
	CircleX,
	Clock,
	Info,
	Layers,
	MoreHorizontal,
	UserX,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
	formatZonedDate,
	formatZonedTime,
	zonedDayLabelOf,
} from "@/lib/date-utils";
import { MyCertificateMenu } from "@/modules/certificates/components/my-certificate-menu";
import { ProgressBar } from "@/modules/content/components/progress-bar";
import type { ClassroomSummary } from "@/modules/content/domain/classroom.types";
import {
	CourseCardFrame,
	CourseCardStatus,
	type CourseMetaItem,
} from "@/modules/courses/components/course-card-frame";
import {
	countsContent,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import { formatHours } from "@/modules/courses/utils/course-labels";
import { RateCourseDialog } from "@/modules/ratings/components/rate-course-dialog";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { ViewMode } from "@/shared/view-mode/view-mode";
import type {
	EnrollmentCourse,
	EnrollmentCourseSession,
	MyCourseEntry,
} from "../domain/enrollment.types";
import { sessionCountOf, withdrawalLabelOf } from "../utils/enrollment-labels";
import type { MyCourseSection } from "../utils/my-courses-filter";
import { isOverFor } from "./my-course-parts";

const detailPathOf = (entry: MyCourseEntry) =>
	`/dashboard/mis-capacitaciones/${entry.course.documentId}`;

const classroomPathOf = (entry: MyCourseEntry) => `${detailPathOf(entry)}/aula`;

// ── Cómo se dicen las fechas ─────────────────────────────────────────────────

/** «vie 2 oct» */
const shortDayOf = (value: Date) => {
	const { weekday, day, month } = zonedDayLabelOf(new Date(value));
	return `${weekday} ${day} ${month}`;
};

const capitalize = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1);

/** «09:00–11:00» */
const timeRangeOf = (session: EnrollmentCourseSession) =>
	`${formatZonedTime(new Date(session.startsAt))}–${formatZonedTime(new Date(session.endsAt))}`;

const startsInOf = (days: number | null) => {
	if (days === null) return "Sin fecha";
	if (days === 0) return "Empieza hoy";
	if (days === 1) return "Empieza mañana";
	return `Empieza en ${days} días`;
};

/** «22 sep 2026 · 1 sesión · 0.5 h»: cuándo fue un curso con sesiones. */
const heldOnOf = (course: EnrollmentCourse) => {
	const last = course.sessions.at(-1);
	if (!last) return null;

	return [
		formatZonedDate(new Date(last.startsAt)),
		sessionCountOf(course.sessions.length),
		course.hours !== null && formatHours(course.hours),
	]
		.filter(Boolean)
		.join(" · ");
};

// ── Qué dice cada tarjeta ─────────────────────────────────────────────────────

interface Status {
	icon: LucideIcon;
	label: string;
	tone: "success" | "muted" | "neutral";
	note?: string;
}

const isCancelled = (entry: MyCourseEntry) =>
	entry.course.status === "CANCELLED";

/** Cómo acabó el curso para quien lo cursó, o por qué ya no lo cursa. */
const closingStatusOf = (
	entry: MyCourseEntry,
	section: MyCourseSection,
): Status | null => {
	const { course, enrollment, outcome } = entry;

	if (section === "withdrawn") {
		return {
			icon: UserX,
			label: withdrawalLabelOf(enrollment),
			tone: "muted",
		};
	}
	if (section !== "finished") return null;

	if (isCancelled(entry)) {
		return {
			icon: CircleX,
			label: "Cancelada por quien la organiza",
			tone: "muted",
			note: "No requiere ninguna acción.",
		};
	}
	// Las sesiones ya pasaron pero nadie ha cerrado el curso: el completado
	// todavía no se calcula.
	if (course.status === "PUBLISHED" && requiresSessions(course.format)) {
		return { icon: Info, label: "Resultado pendiente", tone: "neutral" };
	}
	return outcome.completed
		? { icon: CircleCheck, label: "Completado · 1 crédito", tone: "success" }
		: { icon: CircleMinus, label: "No completado", tone: "muted" };
};

interface Progress {
	percent: number;
	/** «3 de 5 lecciones», «1 de 2 sesiones». */
	count: string | null;
	/** Lo que la lista pone arriba a la derecha. */
	headline: string;
	/** Lo que la cuadrícula pone bajo la barra. */
	caption: string;
	/** La que sigue, cuando el avance se mide en sesiones. */
	next: EnrollmentCourseSession | null;
}

const progressOf = (
	entry: MyCourseEntry,
	classroom: ClassroomSummary | undefined,
): Progress | null => {
	const { course, outcome, timeline } = entry;

	if (classroom && countsContent(course.completionRule)) {
		const count =
			classroom.total > 0
				? `${classroom.done} de ${classroom.total} ${classroom.lessonsOnly ? "lecciones" : "actividades"}`
				: null;
		return {
			percent: outcome.progressPercent,
			count,
			headline: `${outcome.progressPercent} % completado`,
			caption: [`${outcome.progressPercent} %`, count]
				.filter(Boolean)
				.join(" · "),
			next: null,
		};
	}
	if (course.sessions.length === 0) return null;

	const count = `${timeline.sessionsHeld} de ${sessionCountOf(course.sessions.length)}`;
	const next = timeline.nextSession;
	return {
		percent: Math.floor((timeline.sessionsHeld * 100) / course.sessions.length),
		count,
		headline: count,
		caption: next
			? `${count} · próxima: ${shortDayOf(next.startsAt)}, ${formatZonedTime(new Date(next.startsAt))}`
			: count,
		next,
	};
};

// ── Piezas ───────────────────────────────────────────────────────────────────

/** Sede y enlace de una sesión: el enlace se eleva sobre el de la tarjeta. */
function SessionPlace({ session }: { session: EnrollmentCourseSession }) {
	return (
		<>
			{session.venue && <span className="truncate">· {session.venue}</span>}
			{session.link && (
				<a
					href={session.link}
					target="_blank"
					rel="noreferrer"
					className="shrink-0 text-primary underline underline-offset-3 hover:no-underline"
				>
					Enlace de videollamada
				</a>
			)}
		</>
	);
}

// ── Acciones ─────────────────────────────────────────────────────────────────

function ClassroomButton({ entry }: { entry: MyCourseEntry }) {
	const label = isOverFor(entry)
		? "Repasar"
		: entry.outcome.progressPercent > 0
			? "Continuar"
			: "Entrar al aula";

	return (
		<Button asChild>
			<Link to={classroomPathOf(entry)}>
				{label}
				<ArrowRight data-icon="inline-end" aria-hidden="true" />
			</Link>
		</Button>
	);
}

function DetailsButton({ entry }: { entry: MyCourseEntry }) {
	return (
		<Button variant="outline" asChild>
			<Link to={detailPathOf(entry)}>Ver detalles</Link>
		</Button>
	);
}

/**
 * Lo que se hace con un curso terminado. Va primero lo que solo se puede hacer
 * aquí —descargar el certificado, valorar— y lo demás espera en «Más acciones».
 */
function FinishedActions({
	entry,
	hasClassroom,
}: {
	entry: MyCourseEntry;
	hasClassroom: boolean;
}) {
	const [rating, setRating] = useState(false);
	const { course, outcome } = entry;
	const certificate = outcome.certificate;

	const primary = certificate
		? "certificate"
		: entry.canRate
			? "rate"
			: "details";
	const more = {
		rate: entry.canRate && primary !== "rate",
		review: hasClassroom,
		details: primary !== "details",
	};

	return (
		<>
			{primary === "certificate" && certificate && (
				<MyCertificateMenu
					documentId={certificate.documentId}
					downloadable={certificate.downloadable}
					className="h-9"
				/>
			)}
			{primary === "rate" && (
				<RateCourseDialog
					courseDocumentId={course.documentId}
					courseTitle={course.title}
					triggerClassName="h-9"
				/>
			)}
			{primary === "details" && <DetailsButton entry={entry} />}

			{(more.rate || more.review || more.details) && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="icon" aria-label="Más acciones">
							<MoreHorizontal aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{more.details && (
							<DropdownMenuItem asChild>
								<Link to={detailPathOf(entry)}>Ver detalles</Link>
							</DropdownMenuItem>
						)}
						{more.review && (
							<DropdownMenuItem asChild>
								<Link to={classroomPathOf(entry)}>Repasar el contenido</Link>
							</DropdownMenuItem>
						)}
						{more.rate && (
							<DropdownMenuItem onSelect={() => setRating(true)}>
								Valorar capacitación
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{more.rate && (
				<RateCourseDialog
					courseDocumentId={course.documentId}
					courseTitle={course.title}
					open={rating}
					onOpenChange={setRating}
				/>
			)}
		</>
	);
}

function CardActions({
	entry,
	section,
	hasClassroom,
}: {
	entry: MyCourseEntry;
	section: MyCourseSection;
	hasClassroom: boolean;
}) {
	if (section === "finished") {
		return isCancelled(entry) ? null : (
			<FinishedActions entry={entry} hasClassroom={hasClassroom} />
		);
	}
	if (hasClassroom && section !== "withdrawn") {
		return <ClassroomButton entry={entry} />;
	}
	return <DetailsButton entry={entry} />;
}

// ── Detalle por disposición ──────────────────────────────────────────────────

function GridDetail({
	entry,
	section,
	progress,
}: {
	entry: MyCourseEntry;
	section: MyCourseSection;
	progress: Progress | null;
}) {
	const next = entry.timeline.nextSession;

	if (progress) {
		return (
			<div className="flex flex-col gap-1.5">
				<ProgressBar
					value={progress.percent}
					label={`Avance en ${entry.course.title}`}
					className="h-1.5"
				/>
				<p className="text-muted-foreground text-xs">{progress.caption}</p>
			</div>
		);
	}
	if (section === "upcoming" && next) {
		return (
			<p className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 font-medium text-xs">
				<CalendarDays
					className="size-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				Empieza el {shortDayOf(next.startsAt)} ·{" "}
				{formatZonedTime(new Date(next.startsAt))}
			</p>
		);
	}
	return null;
}

/** El renglón bajo los datos: lo que hace falta para decidir sin abrir la ficha. */
function ListDetail({
	entry,
	section,
	progress,
}: {
	entry: MyCourseEntry;
	section: MyCourseSection;
	progress: Progress | null;
}) {
	const { course, outcome, timeline } = entry;

	if (progress && progress.next === null) {
		return (
			<div className="flex items-center gap-3">
				<ProgressBar
					value={progress.percent}
					label={`Avance en ${course.title}`}
					className="h-1.5 max-w-48"
				/>
				{progress.count && (
					<span className="shrink-0 text-muted-foreground text-xs">
						{progress.count}
					</span>
				)}
			</div>
		);
	}

	const next =
		section === "inProgress" || section === "upcoming"
			? timeline.nextSession
			: null;
	if (next) {
		return (
			<p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
				<CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
				<span className="shrink-0 text-foreground">
					{section === "inProgress"
						? `Próxima sesión: ${shortDayOf(next.startsAt)}`
						: capitalize(shortDayOf(next.startsAt))}{" "}
					· {timeRangeOf(next)}
				</span>
				<SessionPlace session={next} />
			</p>
		);
	}

	if (section === "finished" && !isCancelled(entry)) {
		const text = requiresSessions(course.format)
			? heldOnOf(course)
			: outcome.contentCompletedAt &&
				`Terminaste el ${formatZonedDate(new Date(outcome.contentCompletedAt))}`;

		return text ? (
			<p className="text-muted-foreground text-xs">{text}</p>
		) : null;
	}

	return null;
}

// ── Tarjetas ─────────────────────────────────────────────────────────────────

export function MyCourseCard({
	entry,
	section,
	layout,
	classroom,
}: {
	entry: MyCourseEntry;
	section: MyCourseSection;
	layout: ViewMode;
	classroom: ClassroomSummary | undefined;
}) {
	const { course, timeline } = entry;
	const progress =
		section === "inProgress" ? progressOf(entry, classroom) : null;
	const status = closingStatusOf(entry, section);
	const isGrid = layout === "grid";

	const heldOn =
		isGrid && section === "finished" && requiresSessions(course.format)
			? heldOnOf(course)
			: null;
	const meta: CourseMetaItem[] = [
		...(heldOn && !isCancelled(entry)
			? [{ icon: CalendarDays, label: heldOn }]
			: []),
		...(!isGrid && section === "upcoming"
			? [
					{
						icon: Layers,
						label: [
							sessionCountOf(course.sessions.length),
							course.hours !== null && formatHours(course.hours),
						]
							.filter(Boolean)
							.join(" · "),
					},
				]
			: []),
	];

	const headline =
		progress?.headline ??
		(section === "upcoming" ? startsInOf(timeline.daysToStart) : null);

	return (
		<CourseCardFrame
			layout={layout}
			href={detailPathOf(entry)}
			course={course}
			meta={meta}
			dimmed={isCancelled(entry) || section === "withdrawn"}
			detail={
				isGrid ? (
					<GridDetail entry={entry} section={section} progress={progress} />
				) : (
					<ListDetail entry={entry} section={section} progress={progress} />
				)
			}
			status={
				status ? (
					<CourseCardStatus
						icon={status.icon}
						tone={status.tone}
						note={status.note}
					>
						{status.label}
					</CourseCardStatus>
				) : (
					!isGrid && headline && <CourseCardStatus>{headline}</CourseCardStatus>
				)
			}
			actions={
				<CardActions
					entry={entry}
					section={section}
					hasClassroom={classroom !== undefined}
				/>
			}
		/>
	);
}

/** Siempre en renglón: aceptar o rechazar necesita el ancho de los dos botones. */
export function InvitationCard({
	entry,
	busy,
	onAccept,
	onDecline,
}: {
	entry: MyCourseEntry;
	busy: boolean;
	onAccept: () => void;
	onDecline: () => void;
}) {
	const { course, timeline } = entry;
	const first = timeline.nextSession ?? course.sessions[0];

	return (
		<CourseCardFrame
			layout="list"
			href={detailPathOf(entry)}
			course={course}
			className="bg-[color-mix(in_oklch,var(--card),var(--primary)_7%)] ring-primary/20"
			detail={
				first && (
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
						{sessionCountOf(course.sessions.length)} · empieza el{" "}
						{shortDayOf(first.startsAt)}
					</p>
				)
			}
			status={
				course.enrollmentDeadline && (
					<CourseCardStatus icon={Clock} tone="warning">
						Responde antes del {shortDayOf(course.enrollmentDeadline)}
					</CourseCardStatus>
				)
			}
			actions={
				<>
					<Button variant="outline" disabled={busy} onClick={onDecline}>
						Rechazar
					</Button>
					<Button disabled={busy} onClick={onAccept}>
						Aceptar invitación
					</Button>
				</>
			}
		/>
	);
}
