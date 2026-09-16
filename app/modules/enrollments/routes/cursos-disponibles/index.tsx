export { loader } from "./index.loader";

import { BookOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { CourseModalityBadge } from "@/modules/courses/components/course-badges";
import { COURSE_MODALITIES } from "@/modules/courses/domain/course.rules";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
import { DataTable } from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { TextInput } from "@/shared/components/common/text-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	EnrollmentStatusBadge,
	SeatsBadge,
} from "../../components/enrollment-badges";
import type { AvailableCourse } from "../../domain/enrollment.types";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";

type AvailableRow = AvailableCourse & { id: string };

const detailPath = (course: AvailableRow) =>
	`/dashboard/cursos-disponibles/${course.documentId}`;

const dateOrDash = (value: Date | string | null) =>
	value ? formatZonedDate(new Date(value)) : "—";

export const handle = {
	breadcrumb: () => [{ label: "Cursos disponibles" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Cursos disponibles" }];
}

export default function CursosDisponiblesPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { courses, filters },
		pagination,
	} = loaderData;
	const navigate = useNavigate();
	const [, setSearchParams] = useSearchParams();

	const updateParams = useCallback(
		(patch: Record<string, string | number | null>) => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					for (const [key, value] of Object.entries(patch)) {
						if (value === null || value === "" || value === ALL)
							next.delete(key);
						else next.set(key, String(value));
					}
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);

	const [searchTerm, setSearchTerm] = useState(filters.search);

	useEffect(() => {
		if (searchTerm === filters.search) return;

		const timeout = setTimeout(
			() => updateParams({ search: searchTerm, page: null }),
			SEARCH_DEBOUNCE_MS,
		);

		return () => clearTimeout(timeout);
	}, [searchTerm, filters.search, updateParams]);

	const rows = useMemo<AvailableRow[]>(
		() => courses.map((course) => ({ ...course, id: course.documentId })),
		[courses],
	);

	const columns = useMemo(
		() => [
			columnHelpers.text<AvailableRow>("title", "Curso"),
			columnHelpers.text<AvailableRow>("dependencyName", "Organiza"),
			columnHelpers.custom<AvailableRow>("modality", "Modalidad", (course) => (
				<CourseModalityBadge modality={course.modality} />
			)),
			columnHelpers.custom<AvailableRow>("firstSessionAt", "Inicia", (course) =>
				dateOrDash(course.firstSessionAt),
			),
			columnHelpers.custom<AvailableRow>("closesAt", "Cierra", (course) =>
				dateOrDash(course.closesAt),
			),
			columnHelpers.custom<AvailableRow>("seatsLeft", "Lugares", (course) => (
				<SeatsBadge capacity={course.capacity} seatsLeft={course.seatsLeft} />
			)),
			columnHelpers.custom<AvailableRow>("myStatus", "Tu estado", (course) =>
				course.myStatus ? (
					<EnrollmentStatusBadge status={course.myStatus} />
				) : (
					<span className="text-muted-foreground">—</span>
				),
			),
		],
		[],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Cursos disponibles"
				description="Cursos publicados a los que puedes inscribirte mientras la inscripción siga abierta."
			/>

			<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div className="w-full lg:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por título o descripción"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>

				<Select
					value={filters.modality || ALL}
					onValueChange={(value) =>
						updateParams({ modality: value, page: null })
					}
				>
					<SelectTrigger className="w-40">
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
			</div>

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={rows}
					columns={columns}
					emptyState={{
						icon: BookOpen,
						title: "Sin cursos disponibles",
						description:
							"No hay cursos abiertos a inscripción que coincidan con la búsqueda.",
					}}
					mobileCard={{
						title: (course) => course.title,
						description: (course) => course.dependencyName,
						content: (course) => (
							<div className="flex flex-wrap gap-2">
								<CourseModalityBadge modality={course.modality} />
								<SeatsBadge
									capacity={course.capacity}
									seatsLeft={course.seatsLeft}
								/>
							</div>
						),
					}}
					pagination={
						pagination && {
							total: pagination.total,
							page: pagination.page,
							pageSize: pagination.pageSize,
							pageCount: pagination.totalPages,
							onPageChange: (nextPage) => updateParams({ page: nextPage }),
							onPageSizeChange: (nextSize) =>
								updateParams({ pageSize: nextSize, page: null }),
						}
					}
					onRowClick={(course) => navigate(detailPath(course))}
				/>
			</div>
		</div>
	);
}
