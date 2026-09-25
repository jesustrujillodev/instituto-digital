import { Download, ListFilter, Search } from "lucide-react";
import { useId } from "react";
import {
	COURSE_FORMATS,
	COURSE_MODALITIES,
	type CourseFormat,
} from "@/modules/courses/domain/course.rules";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
import { TextInput } from "@/shared/components/common/text-input";
import { ViewModeToggle } from "@/shared/components/common/view-mode-toggle";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import type { ViewMode } from "@/shared/view-mode/view-mode";
import {
	activeFilterCount,
	EMPTY_FILTER,
	MY_COURSE_SECTIONS,
	type MyCoursesFilter,
	SECTION_FILTER_LABELS,
} from "../utils/my-courses-filter";

/** Como lo dice quien cursa, no quien organiza («calendarizado», «autogestivo»). */
const FORMAT_FILTER_LABELS: Record<CourseFormat, string> = {
	SCHEDULED: "Con sesiones",
	SELF_PACED: "A tu ritmo",
};

type ListKey = Exclude<keyof MyCoursesFilter, "query">;

function FilterGroup<T extends string>({
	legend,
	options,
	selected,
	labelOf,
	onToggle,
}: {
	legend: string;
	options: readonly T[];
	selected: readonly T[];
	labelOf: (option: T) => string;
	onToggle: (option: T) => void;
}) {
	const id = useId();

	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-2 font-medium text-muted-foreground text-xs">
				{legend}
			</legend>
			{options.map((option) => (
				<label
					key={option}
					htmlFor={`${id}-${option}`}
					className="flex cursor-pointer items-center gap-2.5 text-sm"
				>
					<Checkbox
						id={`${id}-${option}`}
						checked={selected.includes(option)}
						onCheckedChange={() => onToggle(option)}
					/>
					<span className="min-w-0 truncate">{labelOf(option)}</span>
				</label>
			))}
		</fieldset>
	);
}

export function MyCoursesToolbar({
	filter,
	onFilterChange,
	dependencies,
	layout,
	onLayoutChange,
	canExport,
}: {
	filter: MyCoursesFilter;
	onFilterChange: (filter: MyCoursesFilter) => void;
	dependencies: readonly string[];
	layout: ViewMode;
	onLayoutChange: (layout: ViewMode) => void;
	canExport: boolean;
}) {
	const count = activeFilterCount(filter);

	const toggle = <K extends ListKey>(
		key: K,
		value: MyCoursesFilter[K][number],
	) => {
		const current = filter[key] as readonly string[];
		onFilterChange({
			...filter,
			[key]: current.includes(value)
				? current.filter((item) => item !== value)
				: [...current, value],
		});
	};

	return (
		<div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
			<div className="w-full md:w-64">
				<TextInput
					name="buscar"
					type="search"
					aria-label="Buscar en mis cursos"
					placeholder="Buscar en mis cursos"
					icon={<Search className="size-4" />}
					value={filter.query}
					onChange={(event) =>
						onFilterChange({ ...filter, query: event.target.value })
					}
				/>
			</div>

			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline">
						<ListFilter aria-hidden="true" />
						Filtrar
						{count > 0 && (
							<span className="inline-flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs tabular-nums">
								{count}
							</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					className="flex max-h-(--radix-popover-content-available-height) w-[min(34rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto p-4"
				>
					<div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
						<FilterGroup
							legend="Estado"
							options={MY_COURSE_SECTIONS}
							selected={filter.sections}
							labelOf={(section) => SECTION_FILTER_LABELS[section]}
							onToggle={(section) => toggle("sections", section)}
						/>
						<div className="flex flex-col gap-5">
							<FilterGroup
								legend="Modalidad"
								options={COURSE_MODALITIES}
								selected={filter.modalities}
								labelOf={(modality) => MODALITY_LABELS[modality]}
								onToggle={(modality) => toggle("modalities", modality)}
							/>
							<FilterGroup
								legend="Formato"
								options={COURSE_FORMATS}
								selected={filter.formats}
								labelOf={(format) => FORMAT_FILTER_LABELS[format]}
								onToggle={(format) => toggle("formats", format)}
							/>
						</div>
						{dependencies.length > 1 && (
							<div className="sm:col-span-2">
								<FilterGroup
									legend="Dependencia que organiza"
									options={dependencies}
									selected={filter.dependencies}
									labelOf={(name) => name}
									onToggle={(name) => toggle("dependencies", name)}
								/>
							</div>
						)}
					</div>

					{count > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="self-end"
							onClick={() =>
								onFilterChange({ ...EMPTY_FILTER, query: filter.query })
							}
						>
							Limpiar filtros
						</Button>
					)}
				</PopoverContent>
			</Popover>

			<ViewModeToggle value={layout} onChange={onLayoutChange} />

			{canExport && (
				<Button variant="outline" size="icon" asChild>
					<a
						href="/dashboard/mis-cursos/finalizados.xlsx"
						download
						aria-label="Descargar finalizados en Excel"
						title="Descargar finalizados en Excel"
					>
						<Download aria-hidden="true" />
					</a>
				</Button>
			)}
		</div>
	);
}
