export { loader } from "./index.loader";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { COURSE_MODALITIES } from "@/modules/courses/domain/course.rules";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CalendarMonthGrid } from "../../components/calendar-month-grid";
import { LENS_STYLES } from "../../components/calendar-session-chip";
import { CalendarSessionList } from "../../components/calendar-session-list";
import { CalendarSessionPanel } from "../../components/calendar-session-panel";
import type { CalendarLens } from "../../domain/calendar.config";
import { zonedDayOf } from "../../domain/calendar.rules";
import type {
	CalendarOption,
	CalendarSession,
} from "../../domain/calendar.types";
import {
	formatMonthLabel,
	LENS_LABELS,
	LENS_PRIORITY,
	primaryLensOf,
} from "../../utils/calendar-labels";
import type { Route } from "./+types/index";

const ALL = "all";

export const handle = {
	breadcrumb: () => [{ label: "Calendario" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Calendario" }];
}

function OptionFilter({
	placeholder,
	allLabel,
	value,
	options,
	onChange,
}: {
	placeholder: string;
	allLabel: string;
	value: string | null;
	options: readonly CalendarOption[];
	onChange: (value: string) => void;
}) {
	return (
		<Select value={value ?? ALL} onValueChange={onChange}>
			<SelectTrigger className="w-full sm:w-48">
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>{allLabel}</SelectItem>
				{options.map((option) => (
					<SelectItem key={option.documentId} value={option.documentId}>
						{option.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function Legend({ lenses }: { lenses: readonly CalendarLens[] }) {
	if (lenses.length < 2) return null;

	return (
		<ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
			{lenses.map((lens) => (
				<li key={lens} className="flex items-center gap-1.5">
					<span
						className={cn("size-3 rounded-sm border", LENS_STYLES[lens])}
						aria-hidden="true"
					/>
					{LENS_LABELS[lens]}
				</li>
			))}
		</ul>
	);
}

export default function CalendarioPage({ loaderData }: Route.ComponentProps) {
	const { period, view, sessions, filters, options } = loaderData.data;
	const [, setSearchParams] = useSearchParams();
	const [selected, setSelected] = useState<CalendarSession | null>(null);

	const updateParams = useCallback(
		(patch: Record<string, string | null>) => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					for (const [key, value] of Object.entries(patch)) {
						if (value === null || value === "" || value === ALL) {
							next.delete(key);
						} else {
							next.set(key, value);
						}
					}
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);

	const sessionsByDay = useMemo(() => {
		const byDay = new Map<string, CalendarSession[]>();
		for (const session of sessions) {
			const day = zonedDayOf(new Date(session.startsAt));
			byDay.set(day, [...(byDay.get(day) ?? []), session]);
		}
		return byDay;
	}, [sessions]);

	const presentLenses = useMemo(() => {
		const present = new Set(
			sessions.map((session) => primaryLensOf(session.lenses)),
		);
		return LENS_PRIORITY.filter((lens) => present.has(lens));
	}, [sessions]);

	const monthDays = period.days.filter((day) => day.startsWith(period.month));
	const today = zonedDayOf(new Date());

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Calendario"
				description="Las sesiones que cursas, impartes u organizas."
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={() => updateParams({ month: period.previousMonth })}
					>
						<ChevronLeft className="h-4 w-4" />
						<span className="sr-only">Mes anterior</span>
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() => updateParams({ month: period.nextMonth })}
					>
						<ChevronRight className="h-4 w-4" />
						<span className="sr-only">Mes siguiente</span>
					</Button>
					<Button variant="ghost" onClick={() => updateParams({ month: null })}>
						Hoy
					</Button>
					<h2 className="ml-1 font-semibold text-lg">
						{formatMonthLabel(period.month)}
					</h2>
				</div>

				<div className="flex rounded-lg border border-border p-0.5">
					{(
						[
							["month", "Mes"],
							["list", "Lista"],
						] as const
					).map(([value, label]) => (
						<Button
							key={value}
							size="sm"
							variant={view === value ? "secondary" : "ghost"}
							className="flex-1"
							aria-pressed={view === value}
							onClick={() =>
								updateParams({ view: value === "month" ? null : value })
							}
						>
							{label}
						</Button>
					))}
				</div>
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
				<Select
					value={filters.modality ?? ALL}
					onValueChange={(value) => updateParams({ modality: value })}
				>
					<SelectTrigger className="w-full sm:w-44">
						<SelectValue placeholder="Modalidad" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>Toda modalidad</SelectItem>
						{COURSE_MODALITIES.map((modality) => (
							<SelectItem key={modality} value={modality}>
								{MODALITY_LABELS[modality]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{(options.dependencies.length > 1 || filters.dependency) && (
					<OptionFilter
						placeholder="Dependencia"
						allLabel="Toda dependencia"
						value={filters.dependency}
						options={options.dependencies}
						onChange={(value) => updateParams({ dependency: value })}
					/>
				)}

				{(options.trainers.length > 1 || filters.trainer) && (
					<OptionFilter
						placeholder="Capacitador"
						allLabel="Todo capacitador"
						value={filters.trainer}
						options={options.trainers}
						onChange={(value) => updateParams({ trainer: value })}
					/>
				)}

				{options.canToggleStaff && (
					<div className="flex items-center gap-2">
						<Checkbox
							id="calendar-staff"
							checked={filters.staff}
							onCheckedChange={(checked) =>
								updateParams({ staff: checked === true ? "1" : null })
							}
						/>
						<Label htmlFor="calendar-staff" className="font-normal">
							Incluir cursos de mi personal
						</Label>
					</div>
				)}
			</div>

			<Legend lenses={presentLenses} />

			{view === "list" ? (
				<CalendarSessionList
					days={monthDays}
					sessionsByDay={sessionsByDay}
					onSelect={setSelected}
				/>
			) : (
				<CalendarMonthGrid
					month={period.month}
					days={period.days}
					today={today}
					sessionsByDay={sessionsByDay}
					onSelect={setSelected}
				/>
			)}

			<CalendarSessionPanel
				session={selected}
				onClose={() => setSelected(null)}
			/>
		</div>
	);
}
