export { action } from "./index.action";
export { loader } from "./index.loader";

import { Ban, BookOpen, Plus, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useNavigate, useSearchParams } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import {
	DataTable,
	type DataTableAction,
	defaultActions,
} from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { TextInput } from "@/shared/components/common/text-input";
import { Button } from "@/shared/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	CourseAccessBadge,
	CourseModalityBadge,
	CourseStatusBadge,
} from "../../components/course-badges";
import {
	COURSE_MODALITIES,
	COURSE_STATUSES,
	canCancel,
	canPublish,
} from "../../domain/course.rules";
import { MODALITY_LABELS, STATUS_LABELS } from "../../utils/course-labels";
import {
	COURSE_INTENTS,
	type CourseActionData,
	INTENT_FIELD,
} from "../../utils/parse-course-form-data";
import { type CourseRow, toCourseRows } from "../../utils/to-course-rows";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;
/** Radix no admite un `SelectItem` con valor vacío: "todos" necesita nombre. */
const ALL = "all";

const editPath = (course: CourseRow) =>
	`/dashboard/cursos/${course.documentId}/editar`;

export const handle = {
	breadcrumb: () => [{ label: "Cursos" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Cursos" }];
}

export default function CursosPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { courses, filters, canFilterByDependency, dependencies },
		pagination,
	} = loaderData;
	const navigate = useNavigate();
	const [, setSearchParams] = useSearchParams();

	const fetcher = useFetcher<CourseActionData>();
	useFetcherToast(fetcher);

	const [pendingCancel, setPendingCancel] = useState<CourseRow | null>(null);

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

	const rows = useMemo(() => toCourseRows(courses), [courses]);

	const columns = useMemo(
		() => [
			columnHelpers.text<CourseRow>("title", "Curso"),
			...(canFilterByDependency
				? [columnHelpers.text<CourseRow>("dependencyName", "Organiza")]
				: []),
			columnHelpers.custom<CourseRow>("modality", "Modalidad", (course) => (
				<CourseModalityBadge modality={course.modality} />
			)),
			columnHelpers.custom<CourseRow>("access", "Acceso", (course) => (
				<CourseAccessBadge access={course.access} />
			)),
			columnHelpers.custom<CourseRow>("firstSessionAt", "Inicia", (course) =>
				course.firstSessionAt ? (
					formatZonedDate(new Date(course.firstSessionAt))
				) : (
					<span className="text-muted-foreground">Sin sesiones</span>
				),
			),
			columnHelpers.custom<CourseRow>("status", "Estado", (course) => (
				<CourseStatusBadge status={course.status} />
			)),
		],
		[canFilterByDependency],
	);

	const submitIntent = useCallback(
		(course: CourseRow, intent: string) => {
			fetcher.submit(
				{ documentId: course.documentId, [INTENT_FIELD]: intent },
				{ method: "post" },
			);
		},
		[fetcher],
	);

	const actions = useMemo<DataTableAction<CourseRow>[]>(
		() => [
			defaultActions.edit<CourseRow>((course) => navigate(editPath(course))),
			{
				icon: Send,
				label: "Publicar",
				show: (course) => canPublish(course.status),
				onClick: (course) => submitIntent(course, COURSE_INTENTS.publish),
			},
			{
				icon: Ban,
				label: "Cancelar curso",
				variant: "danger",
				show: (course) => canCancel(course.status),
				onClick: (course) => setPendingCancel(course),
			},
		],
		[navigate, submitIntent],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Cursos"
				description="Borradores, publicados y cancelados de tu alcance. Publicar exige sesiones, un capacitador activo y, si es restringido, audiencia."
				actions={
					<Button asChild>
						<Link to="/dashboard/cursos/nuevo">
							<Plus className="h-4 w-4" />
							Nuevo curso
						</Link>
					</Button>
				}
				collapseActionsOnMobile
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

				<div className="flex flex-wrap gap-2">
					{canFilterByDependency && (
						<Select
							value={filters.dependency || ALL}
							onValueChange={(value) =>
								updateParams({ dependency: value, page: null })
							}
						>
							<SelectTrigger className="w-48">
								<SelectValue placeholder="Dependencia" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL}>Todas las dependencias</SelectItem>
								{dependencies.map((dependency) => (
									<SelectItem
										key={dependency.documentId}
										value={dependency.documentId}
									>
										{dependency.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

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

					<Select
						value={filters.status || ALL}
						onValueChange={(value) =>
							updateParams({ status: value, page: null })
						}
					>
						<SelectTrigger className="w-40">
							<SelectValue placeholder="Estado" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL}>Todo estado</SelectItem>
							{COURSE_STATUSES.map((status) => (
								<SelectItem key={status} value={status}>
									{STATUS_LABELS[status]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={rows}
					columns={columns}
					actions={actions}
					emptyState={{
						icon: BookOpen,
						title: "Sin cursos",
						description:
							"No hay cursos que coincidan con la búsqueda o los filtros aplicados.",
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
					defaultSortKey={filters.sortBy}
					defaultSortDirection={filters.sortDir}
					onSort={(key, direction) =>
						updateParams({ sortBy: key, sortDir: direction, page: null })
					}
					onRowClick={(course) => navigate(editPath(course))}
				/>
			</div>

			<ConfirmDialog
				open={Boolean(pendingCancel)}
				onOpenChange={(open) => {
					if (!open) setPendingCancel(null);
				}}
				title="¿Cancelar el curso?"
				description={`"${pendingCancel?.title ?? ""}" dejará de ofrecerse. Sus sesiones, capacitadores y audiencia se conservan, pero no podrá volver a publicarse.`}
				confirmLabel="Cancelar curso"
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					if (pendingCancel) submitIntent(pendingCancel, COURSE_INTENTS.cancel);
					setPendingCancel(null);
				}}
			/>
		</div>
	);
}
