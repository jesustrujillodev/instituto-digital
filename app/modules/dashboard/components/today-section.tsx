import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { formatZonedTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import type { DashboardToday, TodaySession } from "../domain/dashboard.types";
import { OverflowLink } from "./dashboard-list";
import { DashboardSection } from "./dashboard-section";
import {
	TABLE_ROW,
	TableCard,
	TableFooter,
	TableGroup,
} from "./dashboard-table";

const asDate = (value: Date | string) => new Date(value);

function SessionAction({ session }: { session: TodaySession }) {
	if (session.role === "teaching")
		return (
			<Button asChild size="sm">
				<Link to={session.href}>
					Mostrar QR
					<ArrowRight data-icon="inline-end" aria-hidden="true" />
				</Link>
			</Button>
		);

	if (session.link)
		return (
			<Button asChild size="sm">
				<a href={session.link} target="_blank" rel="noreferrer">
					Entrar
					<ExternalLink data-icon="inline-end" aria-hidden="true" />
					<span className="sr-only">(se abre en otra pestaña)</span>
				</a>
			</Button>
		);

	return (
		<Button asChild size="sm" variant="outline">
			<Link to={session.href}>Ver detalles</Link>
		</Button>
	);
}

function SessionRow({ session }: { session: TodaySession }) {
	const startsAt = asDate(session.startsAt);
	const endsAt = asDate(session.endsAt);
	const place = session.venue ?? (session.link ? "En línea" : null);
	const side = session.role === "teaching" ? "Impartes" : "Cursas";

	return (
		<li
			className={cn(
				TABLE_ROW,
				"grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 @md:grid-cols-[3.5rem_minmax(0,1fr)_auto]",
			)}
		>
			<div className="flex flex-col self-start tabular-nums">
				<span className="font-semibold text-base text-foreground leading-tight">
					{formatZonedTime(startsAt)}
				</span>
				<span className="text-muted-foreground text-xs">
					{formatZonedTime(endsAt)}
				</span>
			</div>
			<div className="flex min-w-0 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<Link
						to={session.href}
						className="line-clamp-2 rounded-sm font-medium text-foreground text-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
					>
						{session.title}
					</Link>
					{session.inProgress && (
						<span className="inline-flex h-5 items-center rounded-lg bg-success px-2 font-medium text-success-foreground text-xs">
							En curso hasta las {formatZonedTime(endsAt)}
						</span>
					)}
				</div>
				<p className="text-muted-foreground text-xs">
					{[side, place].filter(Boolean).join(" · ")}
				</p>
			</div>
			<div className="col-span-2 flex *:w-full @md:col-span-1 @md:*:w-auto">
				<SessionAction session={session} />
			</div>
		</li>
	);
}

/** Las sesiones de hoy que siguen o están en curso, con lo que se hace en cada una; sin ninguna, no aparece. */
export function TodaySection({ today }: { today: DashboardToday }) {
	const total = today.sessions.length + today.overflow;
	if (total === 0) return null;

	return (
		<DashboardSection
			title="Para hoy"
			count={{ value: total, noun: ["sesión", "sesiones"] }}
		>
			<TableCard>
				<TableGroup>
					{today.sessions.map((session) => (
						<SessionRow key={session.sessionDocumentId} session={session} />
					))}
				</TableGroup>
				{today.overflow > 0 && (
					<TableFooter>
						<OverflowLink count={today.overflow} to="/dashboard/calendario" />
					</TableFooter>
				)}
			</TableCard>
		</DashboardSection>
	);
}
