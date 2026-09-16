export { action } from "./index.action";
export { loader } from "./index.loader";

import { Check, GraduationCap, X } from "lucide-react";
import { Link, useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import {
	CourseModalityBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
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
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseSessionsList } from "../../components/course-sessions-list";
import {
	EnrollmentOriginBadge,
	EnrollmentResultBadge,
} from "../../components/enrollment-badges";
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

function MyCourseCard({
	entry,
	children,
}: {
	entry: MyCourseEntry;
	children?: React.ReactNode;
}) {
	const { course, enrollment } = entry;

	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div className="min-w-0">
						<Link
							to={detailPath(entry)}
							className="font-medium hover:underline"
						>
							{course.title}
						</Link>
						<p className="text-muted-foreground text-xs">
							Organiza {course.dependencyName}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<CourseModalityBadge modality={course.modality} />
						{course.status !== "PUBLISHED" && (
							<CourseStatusBadge status={course.status} />
						)}
						<EnrollmentOriginBadge origin={enrollment.origin} />
						{enrollment.status === "ENROLLED" && (
							<EnrollmentResultBadge result={enrollment.result} />
						)}
					</div>
				</div>
				<CourseSessionsList sessions={course.sessions} />
				{children}
			</CardContent>
		</Card>
	);
}

function CourseList({
	entries,
	emptyMessage,
}: {
	entries: readonly MyCourseEntry[];
	emptyMessage: string;
}) {
	if (entries.length === 0) return <EmptyList message={emptyMessage} />;

	return (
		<div className="flex flex-col gap-3">
			{entries.map((entry) => (
				<MyCourseCard key={entry.enrollment.documentId} entry={entry} />
			))}
		</div>
	);
}

export default function MisCursosPage({ loaderData }: Route.ComponentProps) {
	const { data } = loaderData;
	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);

	const respond = (entry: MyCourseEntry, intent: string) =>
		fetcher.submit(
			{ [INTENT_FIELD]: intent, [COURSE_FIELD]: entry.course.documentId },
			{ method: "post" },
		);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Mis cursos"
				description="Tus invitaciones pendientes y los cursos en los que estás inscrito."
			/>

			{data.invitations.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="flex items-center gap-2 font-medium">
						<GraduationCap className="h-4 w-4" />
						Invitaciones pendientes
					</h2>
					{data.invitations.map((entry) => (
						<MyCourseCard key={entry.enrollment.documentId} entry={entry}>
							<p className="text-muted-foreground text-xs">
								{entry.course.enrollmentDeadline
									? `Responde antes del ${formatZonedDate(new Date(entry.course.enrollmentDeadline))}.`
									: "Aceptar ocupa un lugar si todavía queda."}
							</p>
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									disabled={fetcher.state !== "idle"}
									onClick={() => respond(entry, ENROLLMENT_INTENTS.accept)}
								>
									<Check className="h-4 w-4" />
									Aceptar
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={fetcher.state !== "idle"}
									onClick={() => respond(entry, ENROLLMENT_INTENTS.decline)}
								>
									<X className="h-4 w-4" />
									Rechazar
								</Button>
							</div>
						</MyCourseCard>
					))}
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
						emptyMessage="No tienes cursos por empezar."
					/>
				</TabsContent>
				<TabsContent value="inProgress">
					<CourseList
						entries={data.inProgress}
						emptyMessage="No tienes cursos en curso."
					/>
				</TabsContent>
				<TabsContent value="finished">
					<CourseList
						entries={data.finished}
						emptyMessage="Todavía no tienes cursos finalizados."
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
