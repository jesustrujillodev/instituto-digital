export { action } from "./index.action";
export { loader } from "./index.loader";

import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { cn } from "@/lib/utils";
import type { ClassroomSummary } from "@/modules/content/domain/classroom.types";
import { CourseCardList } from "@/modules/courses/components/course-card-frame";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { useViewMode } from "@/shared/hooks/use-view-mode";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { VIEW_MODE_SCREENS, type ViewMode } from "@/shared/view-mode/view-mode";
import { InvitationCard, MyCourseCard } from "../../components/my-course-card";
import { MyCoursesToolbar } from "../../components/my-courses-toolbar";
import type { MyCourseEntry } from "../../domain/enrollment.types";
import {
	activeFilterCount,
	dependencyOptionsOf,
	EMPTY_FILTER,
	MY_COURSE_SECTIONS,
	type MyCourseSection,
	type MyCoursesFilter,
	matchesFilter,
	SECTION_TITLES,
	summaryOf,
	visibleSectionsOf,
} from "../../utils/my-courses-filter";
import {
	COURSE_FIELD,
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	INTENT_FIELD,
} from "../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Mis capacitaciones" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Mis capacitaciones" }];
}

/** El historial se enseña de una fila; lo que está en marcha, completo. */
const COLLAPSED_LIMIT = 3;
const COLLAPSIBLE: readonly MyCourseSection[] = ["finished", "withdrawn"];

function SectionHeading({
	id,
	section,
	count,
	toggle,
}: {
	id: string;
	section: MyCourseSection;
	count: number;
	toggle?: React.ReactNode;
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<h2 id={id} className="flex items-center gap-2 font-bold text-lg">
				{SECTION_TITLES[section]}
				{section === "invitations" ? (
					<span className="inline-flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs tabular-nums">
						{count}
					</span>
				) : (
					<span className="font-medium text-muted-foreground text-sm tabular-nums">
						{count}
					</span>
				)}
			</h2>
			{toggle}
		</div>
	);
}

function CourseSection({
	section,
	entries,
	layout,
	collapsible,
	classrooms,
	respond,
	busy,
}: {
	section: MyCourseSection;
	entries: readonly MyCourseEntry[];
	layout: ViewMode;
	collapsible: boolean;
	classrooms: ReadonlyMap<string, ClassroomSummary>;
	respond: (entry: MyCourseEntry, intent: string) => void;
	busy: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const headingId = `mis-capacitaciones-${section}`;
	const canCollapse = collapsible && entries.length > COLLAPSED_LIMIT;
	const shown =
		canCollapse && !expanded ? entries.slice(0, COLLAPSED_LIMIT) : entries;

	const toggle = canCollapse && (
		<Button
			variant="link"
			size="sm"
			className="h-auto px-0 text-foreground underline underline-offset-4 hover:no-underline"
			aria-expanded={expanded}
			onClick={() => setExpanded((open) => !open)}
		>
			{expanded ? "Ver menos" : `Ver todos (${entries.length})`}
		</Button>
	);

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<SectionHeading
				id={headingId}
				section={section}
				count={entries.length}
				toggle={toggle}
			/>

			{section === "invitations" ? (
				<ul className="flex flex-col gap-3">
					{shown.map((entry) => (
						<li key={entry.enrollment.documentId}>
							<InvitationCard
								entry={entry}
								busy={busy}
								onAccept={() => respond(entry, ENROLLMENT_INTENTS.accept)}
								onDecline={() => respond(entry, ENROLLMENT_INTENTS.decline)}
							/>
						</li>
					))}
				</ul>
			) : (
				<CourseCardList layout={layout}>
					{shown.map((entry, index) => (
						<li
							key={entry.enrollment.documentId}
							className={cn(
								index >= COLLAPSED_LIMIT &&
									"fade-in-0 slide-in-from-top-1 animate-in fill-mode-both duration-300 ease-out",
							)}
						>
							<MyCourseCard
								entry={entry}
								section={section}
								layout={layout}
								classroom={classrooms.get(entry.course.documentId)}
							/>
						</li>
					))}
				</CourseCardList>
			)}
		</section>
	);
}

export default function MisCursosPage({ loaderData }: Route.ComponentProps) {
	const { data } = loaderData;
	const [layout, setLayout] = useViewMode(VIEW_MODE_SCREENS.mine, data.view);
	const [filter, setFilter] = useState<MyCoursesFilter>(EMPTY_FILTER);
	const classrooms = new Map(
		data.classrooms.map((classroom) => [classroom.documentId, classroom]),
	);
	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);

	const respond = (entry: MyCourseEntry, intent: string) =>
		fetcher.submit(
			{ [INTENT_FIELD]: intent, [COURSE_FIELD]: entry.course.documentId },
			{ method: "post" },
		);

	const total = MY_COURSE_SECTIONS.reduce(
		(sum, section) => sum + data[section].length,
		0,
	);
	const isFiltering =
		filter.query.trim() !== "" || activeFilterCount(filter) > 0;
	const sections = visibleSectionsOf(filter)
		.map((section) => ({
			section,
			entries: data[section].filter((entry) => matchesFilter(entry, filter)),
		}))
		.filter(({ entries }) => entries.length > 0);

	return (
		<div className="flex flex-col gap-2 pb-8">
			<PageHeader
				title="Mis capacitaciones"
				description={summaryOf(data) || "Todavía no tienes capacitaciones."}
				actions={
					total > 0 && (
						<MyCoursesToolbar
							filter={filter}
							onFilterChange={setFilter}
							dependencies={dependencyOptionsOf(data)}
							layout={layout}
							onLayoutChange={setLayout}
							canExport={data.finished.length > 0}
						/>
					)
				}
			/>

			{total === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Aún no te inscribes a ninguna capacitación</EmptyTitle>
						<EmptyDescription>
							Aquí verás tus invitaciones, las capacitaciones que llevas y las
							que ya terminaste.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild>
							<Link to="/dashboard/catalogo-de-capacitaciones">
								Ver catálogo de capacitaciones
							</Link>
						</Button>
					</EmptyContent>
				</Empty>
			) : sections.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Ninguna capacitación coincide</EmptyTitle>
						<EmptyDescription>
							Prueba con otra búsqueda o quita algún filtro.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" onClick={() => setFilter(EMPTY_FILTER)}>
							Limpiar búsqueda y filtros
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<div className="flex flex-col gap-10">
					{sections.map(({ section, entries }) => (
						<CourseSection
							key={section}
							section={section}
							entries={entries}
							layout={layout}
							collapsible={!isFiltering && COLLAPSIBLE.includes(section)}
							classrooms={classrooms}
							respond={respond}
							busy={fetcher.state !== "idle"}
						/>
					))}
				</div>
			)}
		</div>
	);
}
