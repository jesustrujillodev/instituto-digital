export { loader } from "./index.loader";

import { Building2, Plus, UserPlus } from "lucide-react";
import type { ShouldRevalidateFunction } from "react-router";
import { Link } from "react-router";
import { CalendarWeekCard } from "@/modules/calendar/components/calendar-week";
import { formatDayLabel } from "@/modules/calendar/utils/calendar-labels";
import { accountLabelOf } from "@/shared/auth/role-labels";
import type { SessionUser } from "@/shared/auth/session-user";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/shared/hooks/use-auth";
import { AttentionSection } from "../../components/attention-section";
import { LearningSection } from "../../components/learning-section";
import { OpenEnrollmentSection } from "../../components/open-enrollment-section";
import { PlanCard } from "../../components/plan-card";
import {
	PlanCoverageSection,
	PlatformAttention,
	PlatformStatusStrip,
} from "../../components/platform-section";
import { TodaySection } from "../../components/today-section";
import { DASHBOARD_LIMITS } from "../../domain/dashboard.config";
import { buildPlatformAttention } from "../../domain/dashboard.rules";
import type { DashboardData } from "../../domain/dashboard.types";
import { shouldRevalidateDashboard } from "../../utils/dashboard-revalidation";
import type { Route } from "./+types/index";

export function meta() {
	return [{ title: "Resumen" }];
}

/** Depende de quién lo pide: ninguna caché compartida debe guardarlo. */
export function headers() {
	return { "Cache-Control": "private, no-store" };
}

export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
	shouldRevalidateDashboard(args);

const roleLineOf = (user: SessionUser, dependencyName: string | null) => {
	const role = accountLabelOf(user);
	return dependencyName ? `${role} · ${dependencyName}` : role;
};

/** El atajo de alta que corresponde a lo que la persona administra. */
function Shortcuts({ data }: { data: DashboardData }) {
	if (data.facets.platform) {
		return (
			<>
				<Button asChild variant="outline">
					<Link to="/dashboard/dependencias/nueva">
						<Building2 data-icon="inline-start" aria-hidden="true" />
						Nueva dependencia
					</Link>
				</Button>
				<Button asChild>
					<Link to="/dashboard/usuarios/nuevo">
						<UserPlus data-icon="inline-start" aria-hidden="true" />
						Nuevo usuario
					</Link>
				</Button>
			</>
		);
	}
	if (data.facets.organizes) {
		return (
			<Button asChild>
				<Link to="/dashboard/capacitaciones/nuevo">
					<Plus data-icon="inline-start" aria-hidden="true" />
					Nueva capacitación
				</Link>
			</Button>
		);
	}
	return null;
}

export default function DashboardHomePage({
	loaderData,
}: Route.ComponentProps) {
	const data = loaderData.data;
	const user = useAuth();
	const { header, today, attention, week, platform, organizing, learning } =
		data;

	return (
		<div className="flex flex-col gap-10 pb-10">
			<div className="flex flex-col gap-6">
				<PageHeader
					title={header.firstName ? `Hola, ${header.firstName}` : "Hola"}
					description={`${formatDayLabel(week.today)} · ${roleLineOf(user, header.dependencyName)}`}
					actions={<Shortcuts data={data} />}
					collapseActionsOnMobile
				/>
				{platform && (
					<PlatformStatusStrip
						health={platform.health}
						activeSessions={platform.activeSessions}
					/>
				)}
			</div>

			<div className="grid items-start gap-x-6 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
				<div className="flex min-w-0 flex-col gap-10 empty:hidden">
					{today && <TodaySection today={today} />}
					{platform ? (
						<>
							<PlatformAttention
								attention={buildPlatformAttention(
									platform,
									DASHBOARD_LIMITS.withoutHead,
								)}
								personal={attention}
								fiscalYear={platform.coverage.fiscalYear}
								today={week.today}
							/>
							<PlanCoverageSection coverage={platform.coverage} />
						</>
					) : (
						attention && (
							<AttentionSection attention={attention} today={week.today} />
						)
					)}
					{organizing && (
						<OpenEnrollmentSection
							summary={organizing.openEnrollment}
							today={week.today}
						/>
					)}
				</div>
				<div className="flex min-w-0 flex-col gap-6">
					<CalendarWeekCard week={week} />
					{organizing?.plan && (
						<PlanCard summary={organizing.plan} today={week.today} />
					)}
				</div>
			</div>

			{learning && <LearningSection learning={learning} />}
		</div>
	);
}
