export { action } from "./index.action";
export { loader } from "./index.loader";

import { Building2, CalendarDays, Check, Layers, X } from "lucide-react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { CourseStatusBadge } from "@/modules/courses/components/course-badges";
import {
	CourseCardFrame,
	CourseCardList,
	type CourseMetaItem,
} from "@/modules/courses/components/course-card-frame";
import { RateCourseDialog } from "@/modules/ratings/components/rate-course-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { ViewModeToggle } from "@/shared/components/common/view-mode-toggle";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { useViewMode } from "@/shared/hooks/use-view-mode";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { VIEW_MODE_SCREENS, type ViewMode } from "@/shared/view-mode/view-mode";
import { CourseSessionsList } from "../../components/course-sessions-list";
import { EnrollmentResultBadge } from "../../components/enrollment-badges";
import type { MyCourseEntry } from "../../domain/enrollment.types";
import {
	COURSE_FIELD,
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	INTENT_FIELD,
} from "../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Mis cursos" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Mis cursos" }];
}

const detailPath = (entry: MyCourseEntry) =>
	`/dashboard/cursos-disponibles/${entry.course.documentId}`;

/** "12 sep" o "12 sep – 3 oct": cuándo ocurre el curso, sin abrir la ficha. */
const dateRangeOf = ({ course }: MyCourseEntry) => {
	if (!course.firstSessionAt) return "Sin fecha";

	const first = formatZonedDate(new Date(course.firstSessionAt));
	const last = course.lastSessionEndsAt
		? formatZonedDate(new Date(course.lastSessionEndsAt))
		: first;

	return first === last ? first : `${first} – ${last}`;
};

const metaOf = (entry: MyCourseEntry): CourseMetaItem[] => {
	const count = entry.course.sessions.length;

	return [
		{ icon: Building2, label: entry.course.dependencyName, wide: true },
		{ icon: CalendarDays, label: dateRangeOf(entry) },
		{ icon: Layers, label: count === 1 ? "1 sesión" : `${count} sesiones` },
	];
};

function EmptyList({ message }: { message: string }) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>Nada por aquí</EmptyTitle>
				<EmptyDescription>{message}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

/** Estado del curso, resultado y crédito: lo que cambia de un curso a otro. */
function EntryFooter({ entry }: { entry: MyCourseEntry }) {
	const { course, enrollment, outcome } = entry;

	if (course.status === "FINISHED") {
		return (
			<>
				<Badge variant={outcome.completed ? "default" : "outline"}>
					{outcome.completed ? "Completado · 1 crédito" : "No completado"}
				</Badge>
				{!entry.canRate && outcome.myRating !== null && (
					<span className="text-muted-foreground text-xs">
						Lo valoraste con {outcome.myRating} de 5
					</span>
				)}
			</>
		);
	}

	return (
		<>
			{course.status !== "PUBLISHED" && (
				<CourseStatusBadge status={course.status} />
			)}
			{enrollment.status === "ENROLLED" && enrollment.result !== "PENDING" && (
				<EnrollmentResultBadge result={enrollment.result} />
			)}
		</>
	);
}

/** Asistencia y nota del curso finalizado; en lista, donde cabe leerla. */
function OutcomeDetail({ entry }: { entry: MyCourseEntry }) {
	const { course, enrollment, outcome } = entry;

	return (
		<p className="text-muted-foreground text-xs">
			Asististe a {outcome.attendedSessions} de {course.sessions.length}{" "}
			sesiones
			{enrollment.result !== "PENDING" && outcome.grade !== null
				? ` · nota ${outcome.grade}`
				: ""}
		</p>
	);
}

function MyCourseCard({
	entry,
	layout,
	actions,
	note,
}: {
	entry: MyCourseEntry;
	layout: ViewMode;
	actions?: React.ReactNode;
	note?: string;
}) {
	const { course } = entry;
	const isFinished = course.status === "FINISHED";
	const footer = <EntryFooter entry={entry} />;

	return (
		<CourseCardFrame
			layout={layout}
			href={detailPath(entry)}
			course={course}
			meta={metaOf(entry)}
			footer={
				note ? (
					<>
						{footer}
						<span className="text-muted-foreground text-xs">{note}</span>
					</>
				) : (
					footer
				)
			}
			actions={
				actions ??
				(entry.canRate && (
					<RateCourseDialog
						courseDocumentId={course.documentId}
						courseTitle={course.title}
					/>
				))
			}
			details={
				isFinished ? (
					<OutcomeDetail entry={entry} />
				) : (
					<CourseSessionsList sessions={course.sessions} />
				)
			}
		/>
	);
}

function CourseList({
	entries,
	layout,
	emptyMessage,
}: {
	entries: readonly MyCourseEntry[];
	layout: ViewMode;
	emptyMessage: string;
}) {
	if (entries.length === 0) return <EmptyList message={emptyMessage} />;

	return (
		<CourseCardList layout={layout}>
			{entries.map((entry) => (
				<li key={entry.enrollment.documentId}>
					<MyCourseCard entry={entry} layout={layout} />
				</li>
			))}
		</CourseCardList>
	);
}

export default function MisCursosPage({ loaderData }: Route.ComponentProps) {
	const { data } = loaderData;
	const [layout, setLayout] = useViewMode(VIEW_MODE_SCREENS.mine, data.view);
	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);

	const respond = (entry: MyCourseEntry, intent: string) =>
		fetcher.submit(
			{ [INTENT_FIELD]: intent, [COURSE_FIELD]: entry.course.documentId },
			{ method: "post" },
		);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Mis cursos"
				description="Tus invitaciones pendientes y los cursos en los que estás inscrito."
				actions={<ViewModeToggle value={layout} onChange={setLayout} />}
				actionsClassName="items-end *:w-auto"
			/>

			{data.invitations.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="font-medium">Invitaciones pendientes</h2>
					<CourseCardList layout={layout}>
						{data.invitations.map((entry) => (
							<li key={entry.enrollment.documentId}>
								<MyCourseCard
									entry={entry}
									layout={layout}
									note={
										entry.course.enrollmentDeadline
											? `Responde antes del ${formatZonedDate(new Date(entry.course.enrollmentDeadline))}`
											: "Aceptar ocupa un lugar si queda"
									}
									actions={
										<>
											<Button
												size="sm"
												disabled={fetcher.state !== "idle"}
												onClick={() =>
													respond(entry, ENROLLMENT_INTENTS.accept)
												}
											>
												<Check />
												Aceptar
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={fetcher.state !== "idle"}
												onClick={() =>
													respond(entry, ENROLLMENT_INTENTS.decline)
												}
											>
												<X />
												Rechazar
											</Button>
										</>
									}
								/>
							</li>
						))}
					</CourseCardList>
				</section>
			)}

			<Tabs defaultValue="upcoming">
				<TabsList>
					<TabsTrigger value="upcoming">
						Próximos ({data.upcoming.length})
					</TabsTrigger>
					<TabsTrigger value="inProgress">
						En curso ({data.inProgress.length})
					</TabsTrigger>
					<TabsTrigger value="finished">
						Finalizados ({data.finished.length})
					</TabsTrigger>
				</TabsList>
				<TabsContent value="upcoming">
					<CourseList
						entries={data.upcoming}
						layout={layout}
						emptyMessage="No tienes cursos por empezar."
					/>
				</TabsContent>
				<TabsContent value="inProgress">
					<CourseList
						entries={data.inProgress}
						layout={layout}
						emptyMessage="No tienes cursos en curso."
					/>
				</TabsContent>
				<TabsContent value="finished">
					<CourseList
						entries={data.finished}
						layout={layout}
						emptyMessage="Todavía no tienes cursos finalizados."
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
