import {
	ArrowRight,
	CalendarCheck,
	ClipboardCheck,
	ExternalLink,
	Mail,
} from "lucide-react";
import { Link } from "react-router";
import {
	formatZonedDate,
	formatZonedDateTime,
	formatZonedTime,
	utcToZonedInput,
} from "@/lib/date-utils";
import { formatDayLabel } from "@/modules/calendar/utils/calendar-labels";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import type {
	DashboardToday,
	NextUp,
	TodayItem,
} from "../domain/dashboard.types";
import { DashboardList, DashboardListItem } from "./dashboard-list";

const asDate = (value: Date | string) => new Date(value);

function TimeColumn({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
	return (
		<div className="flex w-12 shrink-0 flex-col tabular-nums sm:w-14">
			<span className="font-semibold text-base leading-tight">
				{formatZonedTime(startsAt)}
			</span>
			<span className="text-muted-foreground text-xs">
				{formatZonedTime(endsAt)}
			</span>
		</div>
	);
}

function IconColumn({ icon: Icon }: { icon: typeof Mail }) {
	return (
		<div className="flex w-12 shrink-0 sm:w-14">
			<span className="flex size-9 items-center justify-center rounded-full bg-muted">
				<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
			</span>
		</div>
	);
}

function GoButton({
	to,
	variant = "default",
	children,
}: {
	to: string;
	variant?: "default" | "outline";
	children: React.ReactNode;
}) {
	return (
		<Button asChild size="sm" variant={variant}>
			<Link to={to}>
				{children}
				<ArrowRight data-icon="inline-end" aria-hidden="true" />
			</Link>
		</Button>
	);
}

function SessionItem({
	item,
}: {
	item: Extract<TodayItem, { kind: "session" }>;
}) {
	const startsAt = asDate(item.startsAt);
	const endsAt = asDate(item.endsAt);
	const place = item.venue ?? (item.link ? "En línea" : null);
	const side = item.role === "teaching" ? "Impartes" : "Cursas";

	const action =
		item.role === "teaching" ? (
			<GoButton to={item.href}>Mostrar QR</GoButton>
		) : item.link ? (
			<Button asChild size="sm">
				<a href={item.link} target="_blank" rel="noreferrer">
					Entrar
					<ExternalLink data-icon="inline-end" aria-hidden="true" />
					<span className="sr-only">(se abre en otra pestaña)</span>
				</a>
			</Button>
		) : (
			<Button asChild size="sm" variant="outline">
				<Link to={item.href}>Ver detalles</Link>
			</Button>
		);

	return (
		<DashboardListItem
			leading={<TimeColumn startsAt={startsAt} endsAt={endsAt} />}
			title={item.title}
			href={item.href}
			meta={[side, place].filter(Boolean).join(" · ")}
			note={
				item.inProgress
					? `En curso hasta las ${formatZonedTime(endsAt)}`
					: undefined
			}
			tone="success"
			action={action}
		/>
	);
}

function TodayRow({ item }: { item: TodayItem }) {
	switch (item.kind) {
		case "session":
			return <SessionItem item={item} />;
		case "pendingFinish":
			return (
				<DashboardListItem
					leading={<IconColumn icon={ClipboardCheck} />}
					title={item.title}
					href={item.href}
					meta={`Sus sesiones terminaron el ${formatZonedDate(asDate(item.lastSessionEndsAt))}.`}
					action={
						<GoButton to={item.href} variant="outline">
							Finalizar
						</GoButton>
					}
				/>
			);
		case "invitation":
			return (
				<DashboardListItem
					leading={<IconColumn icon={Mail} />}
					title={item.title}
					href={item.href}
					meta="Te invitaron a esta capacitación."
					note={
						item.closesAt
							? `Responde antes del ${formatZonedDateTime(asDate(item.closesAt))}`
							: undefined
					}
					tone="warning"
					action={<GoButton to={item.href}>Responder</GoButton>}
				/>
			);
	}
}

const nextUpPhrase = (next: NextUp) => {
	const startsAt = asDate(next.startsAt);
	const day = formatDayLabel(utcToZonedInput(startsAt).date)
		.toLowerCase()
		.replace(",", "");
	const verb = next.role === "teaching" ? "impartes" : "tienes";

	return `Lo próximo: ${verb} «${next.title}» el ${day} a las ${formatZonedTime(startsAt)}.`;
};

export function TodayPanel({ today }: { today: DashboardToday }) {
	return (
		<Card>
			<CardHeader>
				<h2 className="font-medium text-base">Para hoy</h2>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{today.items.length === 0 ? (
					<div className="flex items-start gap-3">
						<IconColumn icon={CalendarCheck} />
						<div className="flex flex-col gap-1">
							<p className="font-medium text-sm">Nada pendiente para hoy.</p>
							<p className="text-muted-foreground text-sm">
								{today.nextUp
									? nextUpPhrase(today.nextUp)
									: "No tienes sesiones que cursar ni impartir en los próximos siete días."}
							</p>
						</div>
					</div>
				) : (
					<DashboardList label="Pendientes de hoy">
						{today.items.map((item) => (
							<TodayRow
								key={`${item.kind}-${item.kind === "session" ? item.sessionDocumentId : item.courseDocumentId}`}
								item={item}
							/>
						))}
					</DashboardList>
				)}
				{today.overflow > 0 && (
					<p className="text-muted-foreground text-xs">
						Y {today.overflow} pendientes más.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
