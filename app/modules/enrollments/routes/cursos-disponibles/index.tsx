export { loader } from "./index.loader";

import { BookOpen, SearchX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigation, useSearchParams } from "react-router";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CatalogPagination } from "../../components/catalog-pagination";
import { ALL, CatalogToolbar } from "../../components/catalog-toolbar";
import { CourseCard, CourseCardSkeleton } from "../../components/course-card";
import {
	AVAILABLE_LIST_DEFAULTS,
	AVAILABLE_PAGE_SIZES,
} from "../../domain/enrollment.config";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

/** Portadas que se cargan sin esperar al scroll: la primera fila visible. */
const EAGER_COVERS = 4;

/** Claves fijas de las siluetas: son idénticas entre sí y no tienen identidad. */
const SKELETON_KEYS = Array.from(
	{ length: AVAILABLE_PAGE_SIZES.at(-1) ?? 48 },
	(_, index) => `skeleton-${index}`,
);

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
		data: { courses, organizers, filters },
		pagination,
	} = loaderData;
	const [, setSearchParams] = useSearchParams();
	const navigation = useNavigation();
	const location = useLocation();

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

	// Solo una navegación a ESTA ruta es un cambio de filtro o de página. Sin
	// comparar el destino, hacer clic en una tarjeta disolvería la cuadrícula
	// entera en siluetas mientras se va a otra pantalla.
	const isLoading =
		navigation.state === "loading" &&
		navigation.location?.pathname === location.pathname;
	const hasFilters = Boolean(
		filters.search || filters.modality || filters.dependency,
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Cursos disponibles"
				description="Cursos publicados a los que puedes inscribirte mientras la inscripción siga abierta."
			/>

			<div className="flex flex-col gap-4">
				<CatalogToolbar
					searchTerm={searchTerm}
					onSearchChange={setSearchTerm}
					filters={filters}
					organizers={organizers}
					onFilterChange={updateParams}
					onClear={clearFilters}
				/>

				{/* La región viva se monta SIEMPRE y solo cambia su texto: insertar
				    una región ya poblada no se anuncia de forma fiable, así que un
				    lector de pantalla se quedaba sin el recuento tras buscar. */}
				<p className="min-h-5 text-muted-foreground text-sm" aria-live="polite">
					{isLoading || !pagination || pagination.total === 0
						? ""
						: pagination.total === 1
							? "1 curso disponible"
							: `${pagination.total} cursos disponibles`}
				</p>

				{isLoading ? (
					<CardGrid>
						{SKELETON_KEYS.slice(
							0,
							pagination?.pageSize ?? AVAILABLE_LIST_DEFAULTS.pageSize,
						).map((key) => (
							<li key={key}>
								<CourseCardSkeleton />
							</li>
						))}
					</CardGrid>
				) : courses.length === 0 ? (
					<CatalogEmpty hasFilters={hasFilters} onClear={clearFilters} />
				) : (
					<CardGrid>
						{courses.map((course, index) => (
							<li key={course.documentId}>
								<CourseCard course={course} eager={index < EAGER_COVERS} />
							</li>
						))}
					</CardGrid>
				)}

				{pagination && pagination.total > 0 && (
					<CatalogPagination
						page={pagination.page}
						pageSize={pagination.pageSize}
						pageCount={pagination.totalPages}
						total={pagination.total}
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

function CardGrid({ children }: { children: React.ReactNode }) {
	return (
		<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
			{children}
		</ul>
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
					{hasFilters ? "Ningún curso coincide" : "Todavía no hay cursos"}
				</EmptyTitle>
				<EmptyDescription>
					{hasFilters
						? "Prueba con otras palabras o quita algún filtro."
						: "Cuando una dependencia publique un curso abierto a tu perfil, aparecerá aquí."}
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
