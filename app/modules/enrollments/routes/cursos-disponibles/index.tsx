export { loader } from "./index.loader";

import { BookOpen, SearchX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { placeholderCountOf } from "@/lib/placeholders";
import {
	CourseCardList,
	CourseCardListSkeleton,
} from "@/modules/courses/components/course-card-frame";
import { ListPagination } from "@/shared/components/common/list-pagination";
import { PageHeader } from "@/shared/components/common/page-header";
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
import { useRouteReloading } from "@/shared/hooks/use-route-reloading";
import { useViewMode } from "@/shared/hooks/use-view-mode";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { VIEW_MODE_SCREENS } from "@/shared/view-mode/view-mode";
import { ALL, CatalogToolbar } from "../../components/catalog-toolbar";
import { CourseCard } from "../../components/course-card";
import {
	AVAILABLE_LIST_DEFAULTS,
	AVAILABLE_PAGE_SIZES,
} from "../../domain/enrollment.config";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

/** Portadas que se cargan sin esperar al scroll: la primera fila visible. */
const EAGER_COVERS = 4;

export const handle = {
	breadcrumb: () => [{ label: "Catálogo de capacitaciones" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Catálogo de capacitaciones" }];
}

export default function CursosDisponiblesPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { courses, organizers, filters, view },
		pagination,
	} = loaderData;
	const [layout, setLayout] = useViewMode(VIEW_MODE_SCREENS.available, view);
	const [, setSearchParams] = useSearchParams();
	const isLoading = useRouteReloading();

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

	const clearFilters = () => {
		setSearchTerm("");
		updateParams({
			search: null,
			modality: null,
			dependency: null,
			page: null,
		});
	};

	const hasFilters = Boolean(
		filters.search || filters.modality || filters.dependency,
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Catálogo de capacitaciones"
				description="Capacitaciones publicadas a las que puedes inscribirte mientras la inscripción siga abierta."
			/>

			<div className="flex flex-col gap-4">
				<CatalogToolbar
					searchTerm={searchTerm}
					onSearchChange={setSearchTerm}
					filters={filters}
					organizers={organizers}
					onFilterChange={updateParams}
					onClear={clearFilters}
					aside={<ViewModeToggle value={layout} onChange={setLayout} />}
				/>

				{/* La región viva se monta SIEMPRE y solo cambia su texto: insertar
				    una región ya poblada no se anuncia de forma fiable, así que un
				    lector de pantalla se quedaba sin el recuento tras buscar. */}
				<p className="min-h-5 text-muted-foreground text-sm" aria-live="polite">
					{isLoading || !pagination || pagination.total === 0
						? ""
						: pagination.total === 1
							? "1 capacitación disponible"
							: `${pagination.total} capacitaciones disponibles`}
				</p>

				{isLoading ? (
					<CourseCardListSkeleton
						layout={layout}
						count={placeholderCountOf(
							courses.length,
							pagination?.pageSize ?? AVAILABLE_LIST_DEFAULTS.pageSize,
						)}
					/>
				) : courses.length === 0 ? (
					<CatalogEmpty hasFilters={hasFilters} onClear={clearFilters} />
				) : (
					<CourseCardList layout={layout}>
						{courses.map((course, index) => (
							<li key={course.documentId}>
								<CourseCard
									course={course}
									layout={layout}
									eager={index < EAGER_COVERS}
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
						pageSizes={AVAILABLE_PAGE_SIZES}
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

/**
 * Los dos vacíos no son el mismo.
 *
 * "No hay nada" es información sobre el catálogo; "nada coincide" es sobre lo
 * que acabas de escribir, y su salida es deshacerlo.
 */
function CatalogEmpty({
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
					{hasFilters
						? "Ninguna capacitación coincide"
						: "Todavía no hay capacitaciones"}
				</EmptyTitle>
				<EmptyDescription>
					{hasFilters
						? "Prueba con otras palabras o quita algún filtro."
						: "Cuando una dependencia publique una capacitación abierta a tu perfil, aparecerá aquí."}
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
