import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COURSE_MODALITIES } from "@/modules/courses/domain/course.rules";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
import { TextInput } from "@/shared/components/common/text-input";
import { Button } from "@/shared/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { CourseOrganizerOption } from "../domain/enrollment.types";

/** Valor con el que un `Select` expresa "sin filtro"; Radix no admite "". */
export const ALL = "all";

export interface CatalogFilters {
	search: string;
	modality: string;
	dependency: string;
}

interface CatalogToolbarProps {
	searchTerm: string;
	onSearchChange: (value: string) => void;
	filters: CatalogFilters;
	organizers: CourseOrganizerOption[];
	onFilterChange: (patch: Record<string, string | null>) => void;
	onClear: () => void;
}

export function CatalogToolbar({
	searchTerm,
	onSearchChange,
	filters,
	organizers,
	onFilterChange,
	onClear,
}: CatalogToolbarProps) {
	const hasFilters = Boolean(
		searchTerm || filters.modality || filters.dependency,
	);

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-center">
			<div className="w-full md:max-w-xs">
				<TextInput
					name="search"
					aria-label="Buscar cursos"
					placeholder="Buscar por título o descripción"
					icon={<Search className="size-4" />}
					value={searchTerm}
					onChange={(event) => onSearchChange(event.target.value)}
				/>
			</div>

			{/* Tres valores excluyentes se eligen mejor a la vista que dentro de un
			    desplegable que hay que abrir para saber qué ofrece. */}
			<div className="flex flex-wrap items-center gap-2">
				{COURSE_MODALITIES.map((modality) => {
					const isActive = filters.modality === modality;

					return (
						<Button
							key={modality}
							type="button"
							size="sm"
							variant={isActive ? "default" : "outline"}
							aria-pressed={isActive}
							onClick={() =>
								onFilterChange({
									modality: isActive ? null : modality,
									page: null,
								})
							}
						>
							{MODALITY_LABELS[modality]}
						</Button>
					);
				})}
			</div>

			<div className={cn("md:ml-auto", organizers.length < 2 && "hidden")}>
				<Select
					value={filters.dependency || ALL}
					onValueChange={(value) =>
						onFilterChange({ dependency: value, page: null })
					}
				>
					<SelectTrigger className="w-full md:w-56" aria-label="Organiza">
						<SelectValue placeholder="Organiza" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>Cualquier dependencia</SelectItem>
						{organizers.map((organizer) => (
							<SelectItem
								key={organizer.documentId}
								value={organizer.documentId}
							>
								{organizer.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{hasFilters && (
				<Button type="button" variant="ghost" size="sm" onClick={onClear}>
					<X className="size-4" />
					Limpiar
				</Button>
			)}
		</div>
	);
}
