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
import { LearningSection } from "../../components/learning-section";
import { OrganizingSection } from "../../components/organizing-section";
import {
	PlanCoverageSection,
	PlatformAttention,
} from "../../components/platform-section";
import { TodayPanel } from "../../components/today-panel";
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
	const { header, facets, today, week, platform, organizing, learning } = data;

	const scopedToCreator =
		facets.organizes && !facets.plans && user.role === "USER";

	return (
		<div className="flex flex-col gap-10 pb-10">
			<PageHeader
				title={header.firstName ? `Hola, ${header.firstName}` : "Hola"}
				description={`${formatDayLabel(week.today)} · ${roleLineOf(user, header.dependencyName)}`}
				actions={<Shortcuts data={data} />}
				collapseActionsOnMobile
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
				{today ? (
					<TodayPanel today={today} />
				) : (
					platform && (
						<PlatformAttention
							health={platform.health}
							activeSessions={platform.activeSessions}
							withoutHead={platform.withoutHead}
						/>
					)
				)}
				<CalendarWeekCard week={week} />
			</div>

			{platform && <PlanCoverageSection coverage={platform.coverage} />}

			{organizing && (
				<OrganizingSection
					organizing={organizing}
					dependencyName={header.dependencyName}
					scopedToCreator={scopedToCreator}
				/>
			)}

			{learning && <LearningSection learning={learning} />}
		</div>
	);
}
