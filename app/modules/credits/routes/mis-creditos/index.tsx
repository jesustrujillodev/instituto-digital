export { loader } from "./index.loader";

import {
	Building2,
	CalendarDays,
	Clock,
	GraduationCap,
	UserCheck,
} from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
	CourseCardFrame,
	CourseCardList,
	type CourseMetaItem,
} from "@/modules/courses/components/course-card-frame";
import { formatHours } from "@/modules/courses/utils/course-labels";
import { PageHeader } from "@/shared/components/common/page-header";
import { ViewModeToggle } from "@/shared/components/common/view-mode-toggle";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useViewMode } from "@/shared/hooks/use-view-mode";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { VIEW_MODE_SCREENS, type ViewMode } from "@/shared/view-mode/view-mode";
import type { MyCredit, MyCredits } from "../../domain/credit.types";
import { CREDIT_PARAMS } from "../../utils/credit-params";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Mis créditos" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Mis créditos" }];
}

const creditsLabel = (total: number) =>
	total === 1 ? "1 crédito" : `${total} créditos`;

/** "12 sep" o "12 sep – 3 oct". */
const dateRangeOf = ({ course }: MyCredit) => {
	if (!course.firstSessionAt) return "Sin fecha";

	const first = formatZonedDate(new Date(course.firstSessionAt));
	const last = course.lastSessionEndsAt
		? formatZonedDate(new Date(course.lastSessionEndsAt))
		: first;

	return first === last ? first : `${first} – ${last}`;
};

const metaOf = (credit: MyCredit): CourseMetaItem[] => {
	const { course } = credit;
	const items: CourseMetaItem[] = [
		{ icon: Building2, label: course.dependencyName, wide: true },
		{ icon: CalendarDays, label: dateRangeOf(credit) },
	];

	if (course.hours !== null) {
		items.push({ icon: Clock, label: formatHours(course.hours) });
	}
	items.push({
		icon: UserCheck,
		label: `Asistencia ${credit.attendedSessions} de ${course.sessionCount}`,
	});
	if (credit.grade !== null) {
		items.push({ icon: GraduationCap, label: `Nota ${credit.grade}` });
	}

	return items;
};

/** Cada ejercicio con su total; el enlace cambia el que se consulta. */
function YearNav({ data }: { data: MyCredits }) {
	return (
		<nav aria-label="Ejercicios" className="-mx-1 overflow-x-auto px-1 pb-1">
			<ul className="inline-flex gap-1 rounded-full bg-muted p-1">
				{data.years.map(({ fiscalYear, total }) => {
					const active = fiscalYear === data.fiscalYear;

					return (
						<li key={fiscalYear}>
							<Link
								to={`?${CREDIT_PARAMS.fiscalYear}=${fiscalYear}`}
								preventScrollReset
								aria-current={active ? "page" : undefined}
								aria-label={`Ejercicio ${fiscalYear}: ${creditsLabel(total)}`}
								className={cn(
									"inline-flex h-8 items-center gap-2 rounded-full px-3.5 font-medium text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
									active
										? "bg-background text-foreground shadow-sm"
										: "text-foreground/60 hover:text-foreground",
								)}
							>
								{fiscalYear}
								<span
									className={cn(
										"min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
										active
											? "bg-primary text-primary-foreground"
											: "bg-background/60",
									)}
								>
									{total}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

function YearSummary({ data }: { data: MyCredits }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground text-sm">
				<span className="font-semibold text-2xl text-foreground tabular-nums">
					{data.yearTotal}
				</span>{" "}
				{data.yearTotal === 1 ? "crédito" : "créditos"} en {data.fiscalYear}
				{data.yearHours > 0 && (
					<>
						<span aria-hidden="true"> · </span>
						<span className="font-medium text-foreground tabular-nums">
							{formatHours(data.yearHours)}
						</span>
					</>
				)}
				<span aria-hidden="true"> · </span>
				<span className="tabular-nums">{data.historicTotal}</span> en total
			</p>
			{data.byDependency.length > 1 && (
				<p className="text-muted-foreground text-xs">
					Cuentan para{" "}
					{data.byDependency.map((row, index) => (
						<span key={row.label}>
							{index > 0 && " · "}
							<span className="text-foreground">{row.label}</span>{" "}
							<span className="tabular-nums">({row.total})</span>
						</span>
					))}
				</p>
			)}
		</div>
	);
}

function CreditCard({
	credit,
	layout,
	showDependency,
}: {
	credit: MyCredit;
	layout: ViewMode;
	showDependency: boolean;
}) {
	return (
		<CourseCardFrame
			layout={layout}
			href={`/dashboard/cursos-disponibles/${credit.course.documentId}`}
			course={credit.course}
			meta={metaOf(credit)}
			footer={
				<>
					<span className="text-muted-foreground text-xs">
						Otorgado el {formatZonedDate(new Date(credit.grantedAt))}
					</span>
					{showDependency && (
						<Badge variant="outline">Cuenta para {credit.dependencyName}</Badge>
					)}
				</>
			}
		/>
	);
}

export default function MisCreditosPage({ loaderData }: Route.ComponentProps) {
	const { data } = loaderData;
	const [layout, setLayout] = useViewMode(VIEW_MODE_SCREENS.credits, data.view);
	const showDependency = data.byDependency.length > 1;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Mis créditos"
				description="Un crédito por cada curso que completas. Cuenta para la dependencia a la que pertenecías al obtenerlo."
				actions={<ViewModeToggle value={layout} onChange={setLayout} />}
				actionsClassName="items-end *:w-auto"
			/>

			<section aria-label="Resumen" className="flex flex-col gap-4">
				<YearNav data={data} />
				<YearSummary data={data} />
			</section>

			{data.credits.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Sin créditos en {data.fiscalYear}</EmptyTitle>
						<EmptyDescription>
							Los créditos llegan solos cuando se finaliza un curso que
							completaste.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" asChild>
							<Link to="/dashboard/cursos-disponibles">
								Ver cursos disponibles
							</Link>
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<CourseCardList layout={layout}>
					{data.credits.map((credit) => (
						<li key={credit.documentId}>
							<CreditCard
								credit={credit}
								layout={layout}
								showDependency={showDependency}
							/>
						</li>
					))}
				</CourseCardList>
			)}
		</div>
	);
}
