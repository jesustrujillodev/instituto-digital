import { CircleCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import { Link, useRouteLoaderData } from "react-router";
import { PlanProgressBar } from "@/modules/annual-plan/components/plan-badges";
import type { PlanCoverage } from "@/modules/annual-plan/domain/annual-plan.types";
import type { DependencyRef } from "@/modules/dependencies/domain/dependency.types";
import { STUCK_EMAIL_MINUTES } from "@/modules/operations/domain/operations.config";
import type { OperationsHealth } from "@/modules/operations/domain/operations.types";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { DASHBOARD_LAYOUT_ID } from "@/shared/layout/layout.constants";
import type { DashboardLayoutData } from "@/shared/layout/layout.types";
import { DashboardList, DashboardListItem } from "./dashboard-list";
import { DashboardSection, MoreLink } from "./dashboard-section";

const plural = (count: number, one: string, many: string) =>
	count === 1 ? one : many.replace("{n}", String(count));

const healthLines = (health: OperationsHealth) =>
	[
		health.failedEmails > 0 &&
			plural(
				health.failedEmails,
				"1 correo agotó sus intentos y no se envió.",
				"{n} correos agotaron sus intentos y no se enviaron.",
			),
		health.stuckEmails > 0 &&
			plural(
				health.stuckEmails,
				`1 correo pendiente lleva más de ${STUCK_EMAIL_MINUTES} minutos atrasado.`,
				`{n} correos pendientes llevan más de ${STUCK_EMAIL_MINUTES} minutos atrasados.`,
			),
		health.recentJobFailures > 0 &&
			plural(
				health.recentJobFailures,
				`1 trabajo de fondo falló en los últimos ${health.windowDays} días.`,
				`{n} trabajos de fondo fallaron en los últimos ${health.windowDays} días.`,
			),
	].filter((line): line is string => Boolean(line));

/** Lo que la plataforma no pudo hacer sola y lo que bloquea que una dependencia opere. */
export function PlatformAttention({
	health,
	activeSessions,
	withoutHead,
}: {
	health: OperationsHealth;
	activeSessions: number;
	withoutHead: DependencyRef[];
}) {
	const layout = useRouteLoaderData<DashboardLayoutData>(DASHBOARD_LAYOUT_ID);
	const lockdown = layout?.data.securityState?.lockdownAt ?? null;
	const problems = healthLines(health);
	const onlyJobs = health.failedEmails === 0 && health.stuckEmails === 0;

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<h2 className="font-medium text-base">Operación</h2>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-sm">
					{lockdown && (
						<p className="flex items-start gap-2 font-medium text-destructive">
							<ShieldAlert
								className="mt-0.5 size-4 shrink-0"
								aria-hidden="true"
							/>
							<span>
								Hay un bloqueo de emergencia activo.{" "}
								<Link
									to="/dashboard/sesiones"
									className="underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
								>
									Se administra en Sesiones
								</Link>
								.
							</span>
						</p>
					)}
					{problems.length === 0 ? (
						<p className="flex items-center gap-2 font-medium text-success-foreground">
							<CircleCheck className="size-4 shrink-0" aria-hidden="true" />
							Correos y trabajos de fondo al día.
						</p>
					) : (
						<div className="flex flex-col items-start gap-3">
							<ul className="flex flex-col gap-1.5">
								{problems.map((line) => (
									<li key={line} className="flex items-start gap-2">
										<TriangleAlert
											className="mt-0.5 size-4 shrink-0 text-warning-foreground"
											aria-hidden="true"
										/>
										{line}
									</li>
								))}
							</ul>
							<Button asChild size="sm" variant="outline">
								<Link
									to={
										onlyJobs
											? "/dashboard/operacion?tab=jobs"
											: "/dashboard/operacion"
									}
								>
									Revisar
								</Link>
							</Button>
						</div>
					)}
					<p className="text-muted-foreground">
						{plural(
							activeSessions,
							"1 sesión de acceso abierta ahora.",
							"{n} sesiones de acceso abiertas ahora.",
						)}{" "}
						<Link
							to="/dashboard/sesiones"
							className="text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
						>
							Ver sesiones
						</Link>
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
					<h2 className="font-medium text-base">Dependencias sin titular</h2>
					<MoreLink label="Dependencias" to="/dashboard/dependencias" />
				</CardHeader>
				<CardContent>
					{withoutHead.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Todas las dependencias activas tienen titular.
						</p>
					) : (
						<DashboardList>
							{withoutHead.map((dependency) => (
								<DashboardListItem
									key={dependency.documentId}
									title={dependency.name}
									meta="Sin titular no hay quien administre su personal ni su plan."
									action={
										<Button asChild size="sm" variant="outline">
											<Link
												to={`/dashboard/dependencias/${dependency.documentId}/editar`}
											>
												Designar titular
											</Link>
										</Button>
									}
								/>
							))}
						</DashboardList>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

/** El avance del plan de cada dependencia en el ejercicio, y quién no lo tiene. */
export function PlanCoverageSection({ coverage }: { coverage: PlanCoverage }) {
	return (
		<DashboardSection
			title={`Plan anual ${coverage.fiscalYear}`}
			description="El avance de cada dependencia: realizadas sobre lo vigente del plan."
			more={{ label: "Planes", to: "/dashboard/plan-anual" }}
		>
			<Card>
				<CardContent className="flex flex-col gap-4">
					{coverage.plans.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Ninguna dependencia ha creado su plan de {coverage.fiscalYear}.
						</p>
					) : (
						<ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
							{coverage.plans.map((plan) => (
								<li
									key={plan.documentId}
									className="flex min-w-0 flex-col gap-1.5"
								>
									<Link
										to={`/dashboard/plan-anual/${plan.documentId}`}
										className="truncate rounded-sm font-medium text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
									>
										{plan.dependencyName}
									</Link>
									<PlanProgressBar progress={plan.progress} />
								</li>
							))}
						</ul>
					)}
					{coverage.withoutPlan.length > 0 && (
						<p className="border-t pt-3 text-sm">
							<span className="font-medium text-warning-foreground">
								Sin plan:{" "}
							</span>
							{coverage.withoutPlan
								.map((dependency) => dependency.name)
								.join(", ")}
							.
						</p>
					)}
				</CardContent>
			</Card>
		</DashboardSection>
	);
}
