export { action } from "./index.action";
export { loader } from "./index.loader";

import { Archive, ArchiveRestore, Building2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useNavigate, useSearchParams } from "react-router";
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
import { DependencyStatusBadge } from "../../components/dependency-badges";
import {
	DEPENDENCY_INTENTS,
	type DependencyActionData,
	INTENT_FIELD,
} from "../../utils/parse-dependency-form-data";
import {
	type DependencyRow,
	toDependencyRows,
} from "../../utils/to-dependency-rows";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

export const handle = {
	breadcrumb: () => [{ label: "Dependencias" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Dependencias" }];
}

export default function DependenciasPage({ loaderData }: Route.ComponentProps) {
	// Envelope estándar: el dato de la pantalla en `data`, la paginación en su
	// propia clave — la misma forma que devuelve cualquier otro loader.
	const {
		data: { dependencies, filters },
		pagination,
	} = loaderData;
	const { search, status, sortBy, sortDir } = filters;
	const navigate = useNavigate();
	const [, setSearchParams] = useSearchParams();

	const fetcher = useFetcher<DependencyActionData>();
	useFetcherToast(fetcher);

	// ── Filtros en la URL ───────────────────────────────────────────────────────
	const updateParams = useCallback(
		(patch: Record<string, string | number | null>) => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					for (const [key, value] of Object.entries(patch)) {
						if (value === null || value === "") next.delete(key);
						else next.set(key, String(value));
					}
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);

	// El input se controla en local y solo viaja a la URL tras la pausa: sin esto
	// cada tecla dispararía una consulta al servidor.
	const [searchTerm, setSearchTerm] = useState(search);

	useEffect(() => {
		if (searchTerm === search) return;

		const timeout = setTimeout(
			() => updateParams({ search: searchTerm, page: null }),
			SEARCH_DEBOUNCE_MS,
		);

		return () => clearTimeout(timeout);
	}, [searchTerm, search, updateParams]);

	// ── Tabla ───────────────────────────────────────────────────────────────────
	const rows = useMemo(() => toDependencyRows(dependencies), [dependencies]);

	const columns = useMemo(
		() => [
			columnHelpers.text<DependencyRow>("name", "Dependencia"),
			columnHelpers.text<DependencyRow>("acronym", "Siglas"),
			columnHelpers.custom<DependencyRow>(
				"archivedAt",
				"Estado",
				(dependency) => (
					<DependencyStatusBadge archivedAt={dependency.archivedAt} />
				),
			),
			columnHelpers.date<DependencyRow>("createdAt", "Creada"),
		],
		[],
	);

	const submitIntent = useCallback(
		(dependency: DependencyRow, intent: string) => {
			fetcher.submit(
				{ documentId: dependency.documentId, [INTENT_FIELD]: intent },
				{ method: "post" },
			);
		},
		[fetcher],
	);

	// No hay acción de borrado: la FK de `users` es ON DELETE RESTRICT y
	// desactivar es la vía prevista. Ofrecer un borrado que fallaría en cuanto
	// haya personal sería pintar un callejón sin salida.
	const actions = useMemo<DataTableAction<DependencyRow>[]>(
		() => [
			defaultActions.edit<DependencyRow>((dependency) =>
				navigate(`/dashboard/dependencias/${dependency.documentId}/editar`),
			),
			{
				getIcon: (dependency) =>
					dependency.archivedAt ? ArchiveRestore : Archive,
				label: (dependency) =>
					dependency.archivedAt ? "Restaurar" : "Desactivar",
				onClick: (dependency) =>
					submitIntent(
						dependency,
						dependency.archivedAt
							? DEPENDENCY_INTENTS.unarchive
							: DEPENDENCY_INTENTS.archive,
					),
			},
		],
		[navigate, submitIntent],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Dependencias"
				description="Unidades organizativas del instituto. Cada una tiene un titular que administra a su personal."
				actions={
					<Button asChild>
						<Link to="/dashboard/dependencias/nueva">
							<Plus className="h-4 w-4" />
							Nueva dependencia
						</Link>
					</Button>
				}
				collapseActionsOnMobile
			/>

			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="w-full sm:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por nombre o siglas"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>

				<Select
					value={status}
					onValueChange={(value) =>
						updateParams({
							status: value === "active" ? null : value,
							page: null,
						})
					}
				>
					<SelectTrigger className="w-40">
						<SelectValue placeholder="Estado" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="active">Activas</SelectItem>
						<SelectItem value="archived">Desactivadas</SelectItem>
						<SelectItem value="all">Todas</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={rows}
					columns={columns}
					actions={actions}
					emptyState={{
						icon: Building2,
						title: "Sin dependencias",
						description:
							"No hay dependencias que coincidan con la búsqueda o los filtros aplicados.",
					}}
					mobileCard={{
						title: (dependency) => dependency.name,
						description: (dependency) => dependency.acronym ?? "Sin siglas",
						content: (dependency) => (
							<DependencyStatusBadge archivedAt={dependency.archivedAt} />
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
					defaultSortKey={sortBy}
					defaultSortDirection={sortDir}
					onSort={(key, direction) =>
						updateParams({ sortBy: key, sortDir: direction, page: null })
					}
					onRowClick={(dependency) =>
						navigate(`/dashboard/dependencias/${dependency.documentId}/editar`)
					}
				/>
			</div>
		</div>
	);
}
