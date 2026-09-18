export { action } from "./index.action";
export { loader } from "./index.loader";

import {
	Ban,
	BookOpen,
	Building2,
	CalendarDays,
	Layers,
	MoreHorizontal,
	Pencil,
	Plus,
	SearchX,
	Send,
	User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { ListPagination } from "@/shared/components/common/list-pagination";
import { PageHeader } from "@/shared/components/common/page-header";
import { TextInput } from "@/shared/components/common/text-input";
import { ViewModeToggle } from "@/shared/components/common/view-mode-toggle";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import { useViewMode } from "@/shared/hooks/use-view-mode";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { VIEW_MODE_SCREENS, type ViewMode } from "@/shared/view-mode/view-mode";
import {
	CourseAccessBadge,
	CourseStatusBadge,
} from "../../components/course-badges";
import {
	CourseCardFrame,
	CourseCardList,
	type CourseMetaItem,
} from "../../components/course-card-frame";
import { COURSE_PAGE_SIZES } from "../../domain/course.config";
import {
	COURSE_MODALITIES,
	COURSE_STATUSES,
	canCancel,
	canEdit,
	canPublish,
} from "../../domain/course.rules";
import { MODALITY_LABELS, STATUS_LABELS } from "../../utils/course-labels";
import {
	COURSE_INTENTS,
	type CourseActionData,
	INTENT_FIELD,
} from "../../utils/parse-course-form-data";
import type { CourseCard } from "../../utils/to-course-cards";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;
/** Radix no admite un `SelectItem` con valor vacío: "todos" necesita nombre. */
const ALL = "all";

/** Órdenes que ofrece el listado; el valor es `campo:dirección`. */
const SORT_OPTIONS = [
	{ value: "createdAt:desc", label: "Más recientes" },
	{ value: "createdAt:asc", label: "Más antiguos" },
	{ value: "title:asc", label: "Título (A–Z)" },
	{ value: "status:asc", label: "Por estado" },
] as const;

/** Portadas que se cargan sin esperar al scroll: la primera fila visible. */
const EAGER_COVERS = 4;

const detailPath = (course: CourseCard) =>
	`/dashboard/cursos/${course.documentId}`;

export const handle = {
	breadcrumb: () => [{ label: "Cursos" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Cursos" }];
}

export default function CursosPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { courses, filters, canFilterByDependency, dependencies, view },
		pagination,
	} = loaderData;
	const [, setSearchParams] = useSearchParams();
	const [layout, setLayout] = useViewMode(VIEW_MODE_SCREENS.courses, view);

	const fetcher = useFetcher<CourseActionData>();
	useFetcherToast(fetcher);

	const [pendingCancel, setPendingCancel] = useState<CourseCard | null>(null);

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

	const submitIntent = (course: CourseCard, intent: string) =>
		fetcher.submit(
			{ documentId: course.documentId, [INTENT_FIELD]: intent },
			{ method: "post" },
		);

	const hasFilters = Boolean(
		filters.search || filters.dependency || filters.modality || filters.status,
	);

	const clearFilters = () => {
		setSearchTerm("");
		updateParams({
			search: null,
			dependency: null,
			modality: null,
			status: null,
			page: null,
		});
	};

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

			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center">
					<div className="w-full lg:max-w-xs">
						<TextInput
							name="search"
							aria-label="Buscar cursos"
							placeholder="Buscar por título o descripción"
							value={searchTerm}
							onChange={(event) => setSearchTerm(event.target.value)}
						/>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{canFilterByDependency && (
							<Select
								value={filters.dependency || ALL}
								onValueChange={(value) =>
									updateParams({ dependency: value, page: null })
								}
							>
								<SelectTrigger className="w-48" aria-label="Dependencia">
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
							<SelectTrigger className="w-40" aria-label="Modalidad">
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
							<SelectTrigger className="w-40" aria-label="Estado">
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

					<div className="flex items-center justify-between gap-2 lg:ml-auto">
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
					<CoursesEmpty hasFilters={hasFilters} onClear={clearFilters} />
				) : (
					<CourseCardList layout={layout}>
						{courses.map((course, index) => (
							<li key={course.documentId}>
								<CourseCardFrame
									layout={layout}
									href={detailPath(course)}
									course={course}
									eager={index < EAGER_COVERS}
									meta={metaOf(course, canFilterByDependency)}
									footer={
										<>
											<CourseStatusBadge status={course.status} />
											<CourseAccessBadge access={course.access} />
										</>
									}
									menu={
										<CourseMenu
											course={course}
											layout={layout}
											onPublish={() =>
												submitIntent(course, COURSE_INTENTS.publish)
											}
											onCancel={() => setPendingCancel(course)}
										/>
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
						pageSizes={COURSE_PAGE_SIZES}
						onPageChange={(nextPage) => updateParams({ page: nextPage })}
						onPageSizeChange={(nextSize) =>
							updateParams({ pageSize: nextSize, page: null })
						}
					/>
				)}
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

const metaOf = (
	course: CourseCard,
	showOrganizer: boolean,
): CourseMetaItem[] => [
	...(showOrganizer
		? [{ icon: Building2, label: course.dependencyName, wide: true }]
		: []),
	{
		icon: CalendarDays,
		label: course.firstSessionAt
			? formatZonedDate(new Date(course.firstSessionAt))
			: "Sin sesiones",
	},
	...(course.sessionCount > 0
		? [
				{
					icon: Layers,
					label:
						course.sessionCount === 1
							? "1 sesión"
							: `${course.sessionCount} sesiones`,
				},
			]
		: []),
	{
		icon: User,
		label:
			course.trainerCount === 0
				? "Sin capacitador"
				: course.trainerCount === 1
					? "1 capacitador"
					: `${course.trainerCount} capacitadores`,
	},
];

/**
 * Acciones de gestión según el estado. Ver no está: es la tarjeta entera.
 * Un curso finalizado o cancelado no admite ninguna, así que no hay menú.
 */
function CourseMenu({
	course,
	layout,
	onPublish,
	onCancel,
}: {
	course: CourseCard;
	layout: ViewMode;
	onPublish: () => void;
	onCancel: () => void;
}) {
	const edit = canEdit(course.status);
	const publish = canPublish(course.status);
	const cancel = canCancel(course.status);

	if (!edit && !publish && !cancel) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Acciones de ${course.title}`}
					className={cn(
						layout === "grid" &&
							"bg-background/90 shadow-sm backdrop-blur-sm hover:bg-background",
					)}
				>
					<MoreHorizontal />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{edit && (
					<DropdownMenuItem asChild>
						<Link to={`${detailPath(course)}/editar`}>
							<Pencil />
							Editar
						</Link>
					</DropdownMenuItem>
				)}
				{publish && (
					<DropdownMenuItem onSelect={onPublish}>
						<Send />
						Publicar
					</DropdownMenuItem>
				)}
				{cancel && (
					<DropdownMenuItem variant="destructive" onSelect={onCancel}>
						<Ban />
						Cancelar curso
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** "No hay nada" informa del alcance; "nada coincide", de lo que se escribió. */
function CoursesEmpty({
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
					{hasFilters ? <SearchX /> : <BookOpen />}
				</EmptyMedia>
				<EmptyTitle>
					{hasFilters ? "Ningún curso coincide" : "Todavía no hay cursos"}
				</EmptyTitle>
				<EmptyDescription>
					{hasFilters
						? "Prueba con otras palabras o quita algún filtro."
						: "Crea el primero con Nuevo curso."}
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
