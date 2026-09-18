export { loader } from "./index.loader";

import {
	ArrowRight,
	Building2,
	CalendarDays,
	ClipboardCheck,
	SearchX,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { CourseStatusBadge } from "@/modules/courses/components/course-badges";
import {
	CourseCardFrame,
	CourseCardList,
	type CourseMetaItem,
} from "@/modules/courses/components/course-card-frame";
import { STATUS_LABELS } from "@/modules/courses/utils/course-labels";
import { ListPagination } from "@/shared/components/common/list-pagination";
import { PageHeader } from "@/shared/components/common/page-header";
import { TextInput } from "@/shared/components/common/text-input";
import { ViewModeToggle } from "@/shared/components/common/view-mode-toggle";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useViewMode } from "@/shared/hooks/use-view-mode";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { VIEW_MODE_SCREENS } from "@/shared/view-mode/view-mode";
import {
	TEACHABLE_STATUSES,
	TEACHING_PAGE_SIZES,
} from "../../domain/teaching.config";
import type { TeachingCourseSummary } from "../../domain/teaching.types";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";
const EAGER_COVERS = 4;

/** Órdenes que ofrece el listado; el valor es `campo:dirección`. */
const SORT_OPTIONS = [
	{ value: "status:desc", label: "Pendientes primero" },
	{ value: "updatedAt:desc", label: "Más recientes" },
	{ value: "title:asc", label: "Título (A–Z)" },
] as const;

export const handle = {
	breadcrumb: () => [{ label: "Impartición" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Impartición" }];
}

/** "12 sep" o "12 sep – 3 oct". */
const dateRangeOf = (course: TeachingCourseSummary) => {
	if (!course.firstSessionAt) return "Sin sesiones";

	const first = formatZonedDate(new Date(course.firstSessionAt));
	const last = course.lastSessionAt
		? formatZonedDate(new Date(course.lastSessionAt))
		: first;

	return first === last ? first : `${first} – ${last}`;
};

const metaOf = (course: TeachingCourseSummary): CourseMetaItem[] => [
	{ icon: Building2, label: course.dependencyName, wide: true },
	{ icon: CalendarDays, label: dateRangeOf(course) },
	{
		icon: Users,
		label:
			course.enrolledCount === 1
				? "1 inscrito"
				: `${course.enrolledCount} inscritos`,
	},
];

export default function ImparticionPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { courses, filters, view },
		pagination,
	} = loaderData;
	const [, setSearchParams] = useSearchParams();
	const [layout, setLayout] = useViewMode(VIEW_MODE_SCREENS.teaching, view);

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

	const hasFilters = Boolean(filters.search || filters.status);

	const clearFilters = () => {
		setSearchTerm("");
		updateParams({ search: null, status: null, page: null });
	};

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Impartición"
				description="Cursos publicados y finalizados que impartes u organizas: pase de lista, resultados y cierre."
			/>

			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<div className="w-full md:max-w-xs">
						<TextInput
							name="search"
							aria-label="Buscar cursos"
							placeholder="Buscar por título"
							value={searchTerm}
							onChange={(event) => setSearchTerm(event.target.value)}
						/>
					</div>

					<div className="flex flex-wrap items-center gap-2 md:ml-auto">
						<Select
							value={filters.status || ALL}
							onValueChange={(value) =>
								updateParams({ status: value, page: null })
							}
						>
							<SelectTrigger className="w-40" aria-label="Estado">
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
						<Select
							value={`${filters.sortBy}:${filters.sortDir}`}
							onValueChange={(value) => {
								const [sortBy, sortDir] = value.split(":");
								updateParams({ sortBy, sortDir, page: null });
							}}
						>
							<SelectTrigger className="w-44" aria-label="Ordenar por">
								<SelectValue placeholder="Ordenar por" />
							</SelectTrigger>
							<SelectContent>
								{SORT_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<ViewModeToggle value={layout} onChange={setLayout} />
					</div>
				</div>

				{courses.length === 0 ? (
					<TeachingEmpty hasFilters={hasFilters} onClear={clearFilters} />
				) : (
					<CourseCardList layout={layout}>
						{courses.map((course, index) => (
							<li key={course.documentId}>
								<CourseCardFrame
									layout={layout}
									href={`/dashboard/imparticion/${course.documentId}`}
									course={course}
									eager={index < EAGER_COVERS}
									meta={metaOf(course)}
									footer={<CourseStatusBadge status={course.status} />}
									cta={
										<span className="inline-flex items-center gap-1 font-medium text-primary text-sm">
											{course.status === "PUBLISHED"
												? "Pasar lista"
												: "Ver resultados"}
											<ArrowRight
												className="size-4 transition-transform duration-200 group-hover/card:translate-x-0.5"
												aria-hidden="true"
											/>
										</span>
									}
								/>
							</li>
						))}
					</CourseCardList>
				)}

				{pagination && pagination.total > 0 && (
					<ListPagination
						page={pagination.page}
						pageSize={pagination.pageSize}
						pageCount={pagination.totalPages}
						total={pagination.total}
						pageSizes={TEACHING_PAGE_SIZES}
						onPageChange={(nextPage) => updateParams({ page: nextPage })}
						onPageSizeChange={(nextSize) =>
							updateParams({ pageSize: nextSize, page: null })
						}
					/>
				)}
			</div>
		</div>
	);
}

function TeachingEmpty({
	hasFilters,
	onClear,
}: {
	hasFilters: boolean;
	onClear: () => void;
}) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					{hasFilters ? <SearchX /> : <ClipboardCheck />}
				</EmptyMedia>
				<EmptyTitle>
					{hasFilters ? "Ningún curso coincide" : "Sin cursos que impartir"}
				</EmptyTitle>
				<EmptyDescription>
					{hasFilters
						? "Prueba con otras palabras o quita el filtro de estado."
						: "Aquí aparecen los cursos publicados o finalizados que impartes u organiza tu dependencia."}
				</EmptyDescription>
			</EmptyHeader>
			{hasFilters && (
				<EmptyContent>
					<Button type="button" variant="outline" onClick={onClear}>
						Limpiar filtros
					</Button>
				</EmptyContent>
			)}
		</Empty>
	);
}
