export { loader } from "./index.loader";

import { ClipboardCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import {
	CourseModalityBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import { STATUS_LABELS } from "@/modules/courses/utils/course-labels";
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
import { TEACHABLE_STATUSES } from "../../domain/teaching.config";
import type { TeachingCourseSummary } from "../../domain/teaching.types";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";

type TeachingRow = TeachingCourseSummary & { id: string };

export const handle = {
	breadcrumb: () => [{ label: "Impartición" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Impartición" }];
}

export default function ImparticionPage({ loaderData }: Route.ComponentProps) {
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

	const rows = useMemo<TeachingRow[]>(
		() => courses.map((course) => ({ ...course, id: course.documentId })),
		[courses],
	);

	const columns = useMemo(
		() => [
			columnHelpers.text<TeachingRow>("title", "Curso"),
			columnHelpers.text<TeachingRow>("dependencyName", "Organiza"),
			columnHelpers.custom<TeachingRow>("modality", "Modalidad", (course) => (
				<CourseModalityBadge modality={course.modality} />
			)),
			columnHelpers.custom<TeachingRow>(
				"lastSessionAt",
				"Última sesión",
				(course) =>
					course.lastSessionAt ? (
						formatZonedDate(new Date(course.lastSessionAt))
					) : (
						<span className="text-muted-foreground">Sin sesiones</span>
					),
			),
			columnHelpers.custom<TeachingRow>(
				"enrolledCount",
				"Inscritos",
				(course) => course.enrolledCount,
			),
			columnHelpers.custom<TeachingRow>("status", "Estado", (course) => (
				<CourseStatusBadge status={course.status} />
			)),
		],
		[],
	);

	const detailPath = (course: TeachingRow) =>
		`/dashboard/imparticion/${course.documentId}`;

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Impartición"
				description="Cursos publicados y finalizados que impartes u organizas: pase de lista, resultados y cierre."
			/>

			<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div className="w-full lg:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por título"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>

				<Select
					value={filters.status || ALL}
					onValueChange={(value) => updateParams({ status: value, page: null })}
				>
					<SelectTrigger className="w-40">
						<SelectValue placeholder="Estado" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>Todo estado</SelectItem>
						{TEACHABLE_STATUSES.map((status) => (
							<SelectItem key={status} value={status}>
								{STATUS_LABELS[status]}
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
						icon: ClipboardCheck,
						title: "Sin cursos que impartir",
						description:
							"Aquí aparecen los cursos publicados o finalizados que impartes u organiza tu dependencia.",
					}}
					mobileCard={{
						title: (course) => course.title,
						description: (course) => course.dependencyName,
						content: (course) => (
							<div className="flex flex-wrap gap-2">
								<CourseStatusBadge status={course.status} />
								<CourseModalityBadge modality={course.modality} />
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
