import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { PlanProgressBar } from "@/modules/annual-plan/components/plan-badges";
import type { CurrentPlanSummary } from "@/modules/annual-plan/domain/annual-plan.types";
import { MONTH_LABELS } from "@/modules/annual-plan/utils/plan-labels";
import type {
	CourseAttention,
	CourseAttentionList,
} from "@/modules/courses/domain/course-attention.types";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import type { DashboardOrganizing } from "../domain/dashboard.types";
import {
	DashboardList,
	DashboardListItem,
	OverflowLink,
} from "./dashboard-list";
import { DashboardSection, MoreLink } from "./dashboard-section";
import { OpenEnrollmentCard } from "./open-enrollment-card";

const COURSES = "/dashboard/capacitaciones";
const courseHref = (documentId: string) => `${COURSES}/${documentId}`;

function BlockTitle({
	title,
	more,
}: {
	title: string;
	more?: { label: string; to: string };
}) {
	return (
		<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
			<h3 className="font-medium text-base">{title}</h3>
			{more && <MoreLink {...more} />}
		</CardHeader>
	);
}

function PlanCard({ summary }: { summary: CurrentPlanSummary }) {
	const { plan, dueLines, dueTotal, fiscalYear } = summary;

	if (!plan) {
		return (
			<Card>
				<BlockTitle title={`Plan anual ${fiscalYear}`} />
				<CardContent className="flex flex-col items-start gap-3">
					<p className="text-muted-foreground text-sm">
						Tu dependencia aún no tiene plan para {fiscalYear}. Sin él, los
						cursos no se pueden ligar a lo que se planeó.
					</p>
					<Button asChild size="sm">
						<Link to="/dashboard/plan-anual">
							Crear el plan
							<ArrowRight data-icon="inline-end" aria-hidden="true" />
						</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	const planHref = `/dashboard/plan-anual/${plan.documentId}`;

	return (
		<Card>
			<BlockTitle
				title={`Plan anual ${fiscalYear}`}
				more={{ label: "Ver plan", to: planHref }}
			/>
			<CardContent className="flex flex-col gap-4">
				<PlanProgressBar progress={plan.progress} />
				{dueLines.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Todo lo planeado hasta este mes ya tiene curso.
					</p>
				) : (
					<div className="flex flex-col gap-2">
						<p className="text-sm">
							{dueTotal === 1
								? "1 línea ya debería tener curso:"
								: `${dueTotal} líneas ya deberían tener curso:`}
						</p>
						<DashboardList>
							{dueLines.map((line) => (
								<DashboardListItem
									key={line.documentId}
									title={line.title}
									note={
										line.overdue
											? `Atrasada: era para ${MONTH_LABELS[line.plannedMonth].toLowerCase()}`
											: "Planeada para este mes"
									}
									tone={line.overdue ? "warning" : "neutral"}
									action={
										<Button asChild size="sm" variant="outline">
											<Link to={`${COURSES}/nuevo?linea=${line.documentId}`}>
												Crear curso
											</Link>
										</Button>
									}
								/>
							))}
						</DashboardList>
						<OverflowLink count={dueTotal - dueLines.length} to={planHref} />
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function AttentionGroup({
	title,
	reason,
	list,
	more,
}: {
	title: string;
	reason: (updatedAt: Date) => string;
	list: CourseAttentionList;
	more: string;
}) {
	if (list.courses.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			<h4 className="font-medium text-muted-foreground text-xs">{title}</h4>
			<DashboardList>
				{list.courses.map((course) => (
					<DashboardListItem
						key={course.documentId}
						title={course.title}
						href={courseHref(course.documentId)}
						meta={reason(new Date(course.updatedAt))}
					/>
				))}
			</DashboardList>
			{list.truncated && (
				<Link
					to={more}
					className="self-start rounded-sm text-muted-foreground text-xs underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					Ver todos →
				</Link>
			)}
		</div>
	);
}

function AttentionCard({
	attention,
	wide,
}: {
	attention: CourseAttention;
	wide: boolean;
}) {
	const empty =
		attention.drafts.courses.length === 0 &&
		attention.withoutTrainer.courses.length === 0;

	return (
		<Card className={wide ? "lg:col-span-2" : undefined}>
			<BlockTitle title="Cursos que requieren acción" />
			<CardContent className="flex flex-col gap-5">
				{empty ? (
					<p className="text-muted-foreground text-sm">
						No hay borradores pendientes ni cursos publicados sin capacitador.
					</p>
				) : (
					<>
						<AttentionGroup
							title="Publicados sin capacitador activo"
							reason={() =>
								"Su capacitador se desactivó; asigna otro antes de la próxima sesión."
							}
							list={attention.withoutTrainer}
							more={`${COURSES}?status=PUBLISHED`}
						/>
						<AttentionGroup
							title="Borradores sin publicar"
							reason={(updatedAt) =>
								`Editado por última vez el ${formatZonedDate(updatedAt)}`
							}
							list={attention.drafts}
							more={`${COURSES}?status=DRAFT`}
						/>
					</>
				)}
			</CardContent>
		</Card>
	);
}

export function OrganizingSection({
	organizing,
	dependencyName,
	scopedToCreator,
}: {
	organizing: DashboardOrganizing;
	dependencyName: string | null;
	/** Capacitador interno: solo organiza lo que creó. */
	scopedToCreator: boolean;
}) {
	return (
		<DashboardSection
			title={
				scopedToCreator
					? "Lo que organizas"
					: (dependencyName ?? "Tu dependencia")
			}
			description={
				scopedToCreator
					? "Las capacitaciones que creaste."
					: "Lo que organiza tu dependencia."
			}
			more={{ label: "Capacitaciones", to: COURSES }}
		>
			<div className="grid items-start gap-6 lg:grid-cols-2">
				{organizing.plan && <PlanCard summary={organizing.plan} />}
				<AttentionCard
					attention={organizing.attention}
					wide={organizing.plan === null}
				/>
				<OpenEnrollmentCard summary={organizing.openEnrollment} />
			</div>
		</DashboardSection>
	);
}
