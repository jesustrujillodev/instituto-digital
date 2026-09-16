export { action } from "./index.action";
export { loader } from "./index.loader";

import { GraduationCap, Plus, UserMinus, UserPlus } from "lucide-react";
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
import { ActivateProfileDialog } from "../../components/activate-profile-dialog";
import {
	TrainerStatusBadge,
	TrainerTypeBadge,
} from "../../components/trainer-badges";
import {
	INTENT_FIELD,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../../utils/parse-trainer-form-data";
import {
	originOf,
	type TrainerRow,
	toTrainerRows,
} from "../../utils/to-trainer-rows";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

const nameOf = (trainer: TrainerRow) =>
	[trainer.firstName, trainer.lastName].filter(Boolean).join(" ").trim() ||
	trainer.email;

export const handle = {
	breadcrumb: () => [{ label: "Capacitadores" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Capacitadores" }];
}

export default function CapacitadoresPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { trainers, filters, canManage, candidates },
		pagination,
	} = loaderData;
	const { search, type, status, sortBy, sortDir } = filters;
	const navigate = useNavigate();
	const [, setSearchParams] = useSearchParams();
	const [activateOpen, setActivateOpen] = useState(false);

	const fetcher = useFetcher<TrainerActionData>();
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
	const rows = useMemo(() => toTrainerRows(trainers), [trainers]);

	const columns = useMemo(
		() => [
			columnHelpers.custom<TrainerRow>("firstName", "Capacitador", nameOf),
			columnHelpers.text<TrainerRow>("specialty", "Especialidad"),
			columnHelpers.custom<TrainerRow>("type", "Tipo", (trainer) => (
				<TrainerTypeBadge type={trainer.type} />
			)),
			columnHelpers.custom<TrainerRow>(
				"dependencyName",
				"Procedencia",
				originOf,
			),
			columnHelpers.custom<TrainerRow>("archivedAt", "Estado", (trainer) => (
				<TrainerStatusBadge archivedAt={trainer.archivedAt} />
			)),
		],
		[],
	);

	const submitIntent = useCallback(
		(trainer: TrainerRow, intent: string) => {
			fetcher.submit(
				{ userDocumentId: trainer.userDocumentId, [INTENT_FIELD]: intent },
				{ method: "post" },
			);
		},
		[fetcher],
	);

	// Sin permiso de administración el catálogo es de consulta: no se pintan
	// acciones que responderían 403.
	const actions = useMemo<DataTableAction<TrainerRow>[]>(
		() =>
			canManage
				? [
						defaultActions.edit<TrainerRow>((trainer) =>
							navigate(
								`/dashboard/capacitadores/${trainer.userDocumentId}/editar`,
							),
						),
						{
							getIcon: (trainer) => (trainer.archivedAt ? UserPlus : UserMinus),
							label: (trainer) =>
								trainer.archivedAt ? "Reactivar perfil" : "Desactivar perfil",
							onClick: (trainer) =>
								submitIntent(
									trainer,
									trainer.archivedAt
										? TRAINER_INTENTS.reactivate
										: TRAINER_INTENTS.deactivate,
								),
						},
					]
				: [],
		[canManage, navigate, submitIntent],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Capacitadores"
				description="Catálogo institucional. Cualquier dependencia puede asignar a cualquier capacitador activo."
				actions={
					canManage && (
						<>
							<Button variant="outline" onClick={() => setActivateOpen(true)}>
								<GraduationCap className="h-4 w-4" />
								Activar perfil
							</Button>
							<Button asChild>
								<Link to="/dashboard/capacitadores/nuevo">
									<Plus className="h-4 w-4" />
									Capacitador externo
								</Link>
							</Button>
						</>
					)
				}
				collapseActionsOnMobile
			/>

			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="w-full sm:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por nombre o correo"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>

				<div className="flex gap-3">
					<Select
						value={type || "all"}
						onValueChange={(value) =>
							updateParams({ type: value === "all" ? null : value, page: null })
						}
					>
						<SelectTrigger className="w-36">
							<SelectValue placeholder="Tipo" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos</SelectItem>
							<SelectItem value="INTERNAL">Internos</SelectItem>
							<SelectItem value="EXTERNAL">Externos</SelectItem>
						</SelectContent>
					</Select>

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
							<SelectItem value="archived">Desactivados</SelectItem>
							<SelectItem value="all">Todos</SelectItem>
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
						icon: GraduationCap,
						title: "Sin capacitadores",
						description:
							"No hay capacitadores que coincidan con la búsqueda o los filtros aplicados.",
					}}
					mobileCard={{
						title: nameOf,
						description: (trainer) => trainer.specialty,
						content: (trainer) => (
							<div className="flex gap-2">
								<TrainerTypeBadge type={trainer.type} />
								<TrainerStatusBadge archivedAt={trainer.archivedAt} />
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
					onRowClick={
						canManage
							? (trainer) =>
									navigate(
										`/dashboard/capacitadores/${trainer.userDocumentId}/editar`,
									)
							: undefined
					}
				/>
			</div>

			{canManage && (
				<ActivateProfileDialog
					open={activateOpen}
					onOpenChange={setActivateOpen}
					candidates={candidates}
				/>
			)}
		</div>
	);
}
