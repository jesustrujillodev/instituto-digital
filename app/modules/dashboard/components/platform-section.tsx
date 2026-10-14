import {
	Building2,
	CircleCheck,
	MailWarning,
	ServerCrash,
	ShieldAlert,
} from "lucide-react";
import { Link, useRouteLoaderData } from "react-router";
import { cn } from "@/lib/utils";
import type { PlanCoverage } from "@/modules/annual-plan/domain/annual-plan.types";
import { STUCK_EMAIL_MINUTES } from "@/modules/operations/domain/operations.config";
import type { OperationsHealth } from "@/modules/operations/domain/operations.types";
import { DASHBOARD_LAYOUT_ID } from "@/shared/layout/layout.constants";
import type { DashboardLayoutData } from "@/shared/layout/layout.types";
import {
	sortPlansByProgress,
	summarizeCoverage,
} from "../domain/dashboard.rules";
import type {
	DashboardAttention,
	PlatformAttentionItem,
	PlatformAttentionList,
} from "../domain/dashboard.types";
import { AttentionCard, AttentionChip, AttentionList } from "./attention-card";
import {
	PersonalAttentionCards,
	PersonalAttentionMore,
} from "./attention-section";
import { OverflowLink } from "./dashboard-list";
import { DashboardSection, EmptyNote } from "./dashboard-section";
import {
	MeterBar,
	TABLE_ROW,
	TableCard,
	TableGroup,
	TableSummary,
} from "./dashboard-table";
import { StatusStrip, type StripTone } from "./status-strip";

const plural = (count: number, one: string, many: string) =>
	count === 1 ? one : many.replace("{n}", String(count));

const percentOf = (ratio: number | null) => Math.round((ratio ?? 0) * 100);

function useLockdown() {
	const layout = useRouteLoaderData<DashboardLayoutData>(DASHBOARD_LAYOUT_ID);
	return Boolean(layout?.data.securityState?.lockdownAt);
}

const operationsSummary = (health: OperationsHealth) => {
	const emails = health.failedEmails + health.stuckEmails;
	const parts = [
		emails > 0 &&
			plural(emails, "1 correo sin enviar", "{n} correos sin enviar"),
		health.recentJobFailures > 0 &&
			plural(
				health.recentJobFailures,
				"1 trabajo de fondo con falla",
				"{n} trabajos de fondo con falla",
			),
	].filter((part): part is string => Boolean(part));

	return parts.length === 0
		? "Correos y trabajos de fondo al día"
		: parts.join(" · ");
};

/** Cómo está la plataforma, en una línea. */
export function PlatformStatusStrip({
	health,
	activeSessions,
}: {
	health: OperationsHealth;
	activeSessions: number;
}) {
	const lockdown = useLockdown();
	const hasProblems =
		health.failedEmails + health.stuckEmails + health.recentJobFailures > 0;
	const tone: StripTone = lockdown ? "danger" : hasProblems ? "warning" : "ok";

	return (
		<StatusStrip
			label="Estado de la plataforma"
			tone={tone}
			status={
				{
					ok: "Sistema en orden",
					warning: "Hay pendientes de operación",
					danger: "Lockdown activo",
				}[tone]
			}
			facts={[
				operationsSummary(health),
				plural(
					activeSessions,
					"1 sesión de acceso abierta",
					"{n} sesiones de acceso abiertas",
				),
			]}
			link={{ label: "Ver sesiones", to: "/dashboard/sesiones" }}
		/>
	);
}

const emailsDescription = (failed: number, stuck: number) =>
	[
		failed > 0 &&
			plural(
				failed,
				"1 correo agotó sus intentos y no se envió.",
				"{n} correos agotaron sus intentos y no se enviaron.",
			),
		stuck > 0 &&
			plural(
				stuck,
				`1 correo pendiente lleva más de ${STUCK_EMAIL_MINUTES} minutos atrasado.`,
				`{n} correos pendientes llevan más de ${STUCK_EMAIL_MINUTES} minutos atrasados.`,
			),
	]
		.filter(Boolean)
		.join(" ");

function PlatformAttentionCard({
	item,
	fiscalYear,
}: {
	item: PlatformAttentionItem;
	fiscalYear: number;
}) {
	switch (item.kind) {
		case "emails":
			return (
				<AttentionCard
					icon={MailWarning}
					title="Correos sin enviar"
					description={emailsDescription(item.failed, item.stuck)}
					action={{ label: "Revisar correos", to: "/dashboard/operacion" }}
				/>
			);
		case "jobs":
			return (
				<AttentionCard
					icon={ServerCrash}
					title="Trabajos de fondo con fallas"
					description={plural(
						item.failed,
						`1 trabajo de fondo falló en los últimos ${item.windowDays} días.`,
						`{n} trabajos de fondo fallaron en los últimos ${item.windowDays} días.`,
					)}
					action={{
						label: "Revisar trabajos",
						to: "/dashboard/operacion?tab=jobs",
					}}
				/>
			);
		case "withoutHead":
			return (
				<AttentionCard
					icon={Building2}
					title={item.dependency.name}
					chips={
						<>
							<AttentionChip>Sin titular</AttentionChip>
							{item.withoutPlan && (
								<AttentionChip>Sin plan {fiscalYear}</AttentionChip>
							)}
						</>
					}
					description={
						item.withoutPlan
							? "Nadie administra su personal ni su plan. Designa a un titular para que pueda armar el plan anual."
							: "Nadie administra su personal ni su plan. Designa a un titular para que pueda operar."
					}
					action={{
						label: "Designar titular",
						to: `/dashboard/dependencias/${item.dependency.documentId}/editar`,
					}}
				/>
			);
	}
}

/**
 * Lo que la plataforma no pudo hacer sola y lo que bloquea que una dependencia
 * opere. Si el superadministrador además imparte, lo suyo va detrás.
 */
export function PlatformAttention({
	attention,
	personal,
	fiscalYear,
	today,
}: {
	attention: PlatformAttentionList;
	personal: DashboardAttention | null;
	fiscalYear: number;
	today: string;
}) {
	const lockdown = useLockdown();
	const count =
		attention.items.length +
		attention.overflow +
		(personal?.items.length ?? 0) +
		(lockdown ? 1 : 0);

	return (
		<DashboardSection
			title="Requiere tu atención"
			count={{
				value: count,
				noun: ["pendiente", "pendientes"],
				tone: "warning",
			}}
		>
			{count === 0 ? (
				<EmptyNote icon={CircleCheck} tone="success">
					Nada pendiente: la operación está al día y todas las dependencias
					activas tienen titular.
				</EmptyNote>
			) : (
				<>
					<AttentionList>
						{lockdown && (
							<AttentionCard
								tone="danger"
								icon={ShieldAlert}
								title="Lockdown activo"
								description="La plataforma está en lockdown de emergencia. Revisa su alcance y levántalo desde Sesiones."
								action={{ label: "Ir a Sesiones", to: "/dashboard/sesiones" }}
							/>
						)}
						{attention.items.map((item) => (
							<PlatformAttentionCard
								key={
									item.kind === "withoutHead"
										? item.dependency.documentId
										: item.kind
								}
								item={item}
								fiscalYear={fiscalYear}
							/>
						))}
						{personal && (
							<PersonalAttentionCards attention={personal} today={today} />
						)}
					</AttentionList>
					<OverflowLink
						count={attention.overflow}
						to="/dashboard/dependencias"
					/>
					{personal && <PersonalAttentionMore attention={personal} />}
				</>
			)}
		</DashboardSection>
	);
}

const COVERAGE_ROW = cn(
	TABLE_ROW,
	"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 @xl:grid-cols-[minmax(0,1fr)_minmax(7rem,13rem)_3rem_minmax(0,10rem)]",
);

/** El avance del plan de cada dependencia en el ejercicio, y quién no lo tiene. */
export function PlanCoverageSection({ coverage }: { coverage: PlanCoverage }) {
	const totals = summarizeCoverage(coverage);
	const plans = sortPlansByProgress(coverage.plans);

	return (
		<DashboardSection
			title={`Plan anual ${coverage.fiscalYear}`}
			description="Capacitaciones realizadas de las vigentes en el plan de cada dependencia."
			more={{ label: "Ver planes", to: "/dashboard/plan-anual" }}
		>
			<TableCard>
				{totals.dependencies === 0 ? (
					<p className="px-6 py-5 text-muted-foreground text-sm">
						Aún no hay dependencias activas con las que medir el plan.
					</p>
				) : (
					<>
						<TableSummary
							figure={
								totals.ratio === null
									? undefined
									: `${percentOf(totals.ratio)} %`
							}
						>
							{totals.ratio === null
								? `Ningún plan de ${coverage.fiscalYear} tiene capacitaciones vigentes todavía`
								: `${totals.done} de ${plural(totals.active, "1 capacitación realizada en total", "{n} capacitaciones realizadas en total")}`}
							{" · "}
							{totals.withPlan} de{" "}
							{plural(
								totals.dependencies,
								"1 dependencia con plan",
								"{n} dependencias con plan",
							)}
						</TableSummary>

						<TableGroup>
							{plans.map((plan) => {
								const active = plan.progress.total - plan.progress.cancelled;
								const complete = active > 0 && plan.progress.done >= active;

								return (
									<li key={plan.documentId} className={COVERAGE_ROW}>
										<Link
											to={`/dashboard/plan-anual/${plan.documentId}`}
											className="col-span-2 truncate rounded-sm font-medium text-foreground text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30 @xl:col-span-1"
										>
											{plan.dependencyName}
										</Link>
										<MeterBar
											percent={percentOf(plan.progress.ratio)}
											complete={complete}
											label={`Avance del plan de ${plan.dependencyName}`}
											value={plan.progress.ratio === null ? "—" : undefined}
										/>
										<p
											className={cn(
												"col-span-2 text-xs tabular-nums @xl:col-span-1",
												complete
													? "flex items-center gap-1.5 font-medium text-success-foreground"
													: "text-foreground/80",
											)}
										>
											{complete && (
												<CircleCheck
													className="size-3.5 shrink-0"
													aria-hidden="true"
												/>
											)}
											{active === 0
												? "Sin capacitaciones vigentes"
												: complete
													? `Completo · ${plan.progress.done} de ${active}`
													: `${plan.progress.done} de ${active} realizadas`}
										</p>
									</li>
								);
							})}
							{coverage.withoutPlan.map((dependency) => (
								<li key={dependency.documentId} className={COVERAGE_ROW}>
									<p className="truncate font-medium text-foreground text-sm">
										{dependency.name}
									</p>
									<p className="hidden text-muted-foreground text-xs @xl:col-span-2 @xl:block">
										Sin plan registrado
									</p>
									<p className="whitespace-nowrap font-medium text-warning-foreground text-xs">
										Sin plan
									</p>
								</li>
							))}
						</TableGroup>
					</>
				)}
			</TableCard>
		</DashboardSection>
	);
}
