export { action } from "./index.action";
export { loader } from "./index.loader";

import { Archive, ArchiveRestore, Plus, Users } from "lucide-react";
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
import {
	GroupStatusBadge,
	MemberCountBadge,
} from "../../components/group-badges";
import {
	GROUP_INTENTS,
	type GroupActionData,
	INTENT_FIELD,
} from "../../utils/parse-group-form-data";
import { type GroupRow, toGroupRows } from "../../utils/to-group-rows";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

export const handle = {
	breadcrumb: () => [{ label: "Grupos" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Grupos" }];
}

export default function GruposPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { groups, filters, canManage },
		pagination,
	} = loaderData;
	const { search, status, sortBy, sortDir } = filters;
	const navigate = useNavigate();
	const [, setSearchParams] = useSearchParams();

	const fetcher = useFetcher<GroupActionData>();
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
	const rows = useMemo(() => toGroupRows(groups), [groups]);

	const columns = useMemo(
		() => [
			columnHelpers.text<GroupRow>("name", "Grupo"),
			columnHelpers.custom<GroupRow>("memberCount", "Miembros", (group) => (
				<MemberCountBadge count={group.memberCount} />
			)),
			columnHelpers.custom<GroupRow>("archivedAt", "Estado", (group) => (
				<GroupStatusBadge archivedAt={group.archivedAt} />
			)),
			columnHelpers.date<GroupRow>("createdAt", "Creado"),
		],
		[],
	);

	const submitIntent = useCallback(
		(group: GroupRow, intent: string) => {
			fetcher.submit(
				{ documentId: group.documentId, [INTENT_FIELD]: intent },
				{ method: "post" },
			);
		},
		[fetcher],
	);

	// Sin alcance de dependencia la pantalla es de consulta: el
	// superadministrador ve los grupos de todas y no administra ninguno.
	const actions = useMemo<DataTableAction<GroupRow>[]>(
		() =>
			canManage
				? [
						defaultActions.edit<GroupRow>((group) =>
							navigate(`/dashboard/grupos/${group.documentId}/editar`),
						),
						{
							getIcon: (group) => (group.archivedAt ? ArchiveRestore : Archive),
							label: (group) => (group.archivedAt ? "Restaurar" : "Archivar"),
							onClick: (group) =>
								submitIntent(
									group,
									group.archivedAt
										? GROUP_INTENTS.unarchive
										: GROUP_INTENTS.archive,
								),
						},
					]
				: [],
		[canManage, navigate, submitIntent],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Grupos"
				description="Listas nominales de tu dependencia. Sirven para restringir un curso o invitar a varias personas de una vez."
				actions={
					canManage && (
						<Button asChild>
							<Link to="/dashboard/grupos/nuevo">
								<Plus className="h-4 w-4" />
								Nuevo grupo
							</Link>
						</Button>
					)
				}
				collapseActionsOnMobile
			/>

			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="w-full sm:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por nombre o descripción"
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
						<SelectItem value="active">Activos</SelectItem>
						<SelectItem value="archived">Archivados</SelectItem>
						<SelectItem value="all">Todos</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={rows}
					columns={columns}
					actions={actions}
					emptyState={{
						icon: Users,
						title: "Sin grupos",
						description:
							"No hay grupos que coincidan con la búsqueda o los filtros aplicados.",
					}}
					mobileCard={{
						title: (group) => group.name,
						description: (group) => group.description ?? "Sin descripción",
						content: (group) => (
							<div className="flex gap-2">
								<MemberCountBadge count={group.memberCount} />
								<GroupStatusBadge archivedAt={group.archivedAt} />
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
					defaultSortKey={sortBy}
					defaultSortDirection={sortDir}
					onSort={(key, direction) =>
						updateParams({ sortBy: key, sortDir: direction, page: null })
					}
					onRowClick={(group) =>
						navigate(`/dashboard/grupos/${group.documentId}/editar`)
					}
				/>
			</div>
		</div>
	);
}
