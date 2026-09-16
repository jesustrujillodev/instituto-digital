export { action } from "./index.action";
export { loader } from "./index.loader";

import {
	Archive,
	ArchiveRestore,
	KeyRound,
	Plus,
	Trash2,
	UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useNavigate, useSearchParams } from "react-router";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import {
	DataTable,
	type DataTableAction,
	defaultActions,
} from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { TextInput } from "@/shared/components/common/text-input";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
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
import { ROLES } from "@/shared/rules/atoms.rules";
import {
	ResetPasswordDialog,
	type ResetPasswordTarget,
} from "../../components/reset-password-dialog";
import {
	ROLE_FILTER_LABELS,
	RoleBadge,
	StatusBadge,
	TrainerBadge,
} from "../../components/user-badges";
import { UserDetailsSheet } from "../../components/user-details-sheet";
import {
	INTENT_FIELD,
	USER_INTENTS,
	type UserActionData,
} from "../../utils/parse-user-form-data";
import {
	fullNameOf,
	initialsOf,
	toUserRows,
	type UserRow,
} from "../../utils/to-user-rows";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

// Valor centinela del filtro: Radix no admite un SelectItem con value="".
const ANY_ROLE = "any";

// Mismo centinela para el filtro de dependencia, por el mismo motivo.
const ANY_DEPENDENCY = "any";

// Mismo centinela para el filtro de perfil de capacitador.
const ANY_TRAINER = "any";

export const handle = {
	breadcrumb: () => [{ label: "Usuarios" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Usuarios" }];
}

export default function UsuariosPage({ loaderData }: Route.ComponentProps) {
	// Envelope estándar: el dato de la pantalla en `data`, la paginación en su
	// propia clave — la misma forma que devuelve cualquier otro loader.
	const {
		data: { users, filters, canFilterByDependency, dependencies },
		pagination,
	} = loaderData;
	const { search, role, dependency, trainer, status, sortBy, sortDir } =
		filters;
	const navigate = useNavigate();
	const [, setSearchParams] = useSearchParams();
	// Se guarda el id y no la fila: la fila se relee de cada respuesta del loader,
	// así que archivar desde el panel actualiza sus insignias y, si la cuenta
	// desaparece del listado, el panel se cierra solo.
	const [detailId, setDetailId] = useState<string | null>(null);
	const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(
		null,
	);
	// El borrado permanente es irreversible: se confirma en un diálogo propio, y
	// la fila se recuerda aquí porque el diálogo no la conoce.
	const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);

	const fetcher = useFetcher<UserActionData>();
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
	const rows = useMemo(() => toUserRows(users), [users]);

	// El nombre se resuelve en el cliente contra el catálogo que ya trajo el
	// loader: la alternativa —proyectarlo en cada fila— metería en el dominio de
	// `users` un campo que no es suyo.
	const dependencyNames = useMemo(
		() => new Map(dependencies.map((item) => [item.id, item.name])),
		[dependencies],
	);
	const detailUser = rows.find((row) => row.documentId === detailId) ?? null;

	const columns = useMemo(
		() => [
			columnHelpers.custom<UserRow>("firstName", "Usuario", (user) => (
				<div className="flex items-center gap-3">
					<Avatar>
						{user.photoUrl && <AvatarImage src={user.photoUrl} alt="" />}
						<AvatarFallback>{initialsOf(user)}</AvatarFallback>
					</Avatar>
					<span className="font-medium text-sm text-foreground">
						{fullNameOf(user) || "Sin nombre"}
					</span>
				</div>
			)),
			columnHelpers.text<UserRow>("email", "Correo"),
			columnHelpers.text<UserRow>("employeeNumber", "N.º de empleado"),
			columnHelpers.text<UserRow>("phone", "Teléfono"),
			// Solo con alcance global: para un titular la columna diría siempre lo
			// mismo, que es su propia dependencia.
			...(canFilterByDependency
				? [
						columnHelpers.custom<UserRow>(
							"dependencyId",
							"Dependencia",
							(user) => (
								<span className="text-sm">
									{user.dependencyId === null
										? "—"
										: (dependencyNames.get(user.dependencyId) ?? "—")}
								</span>
							),
						),
					]
				: []),
			columnHelpers.custom<UserRow>("role", "Rol", (user) => (
				<span className="flex flex-wrap gap-1">
					<RoleBadge role={user.role} />
					<TrainerBadge isTrainer={user.isTrainer} />
				</span>
			)),
			columnHelpers.custom<UserRow>("archivedAt", "Estado", (user) => (
				<StatusBadge archivedAt={user.archivedAt} />
			)),
			columnHelpers.date<UserRow>("createdAt", "Creado"),
		],
		[canFilterByDependency, dependencyNames],
	);

	const submitIntent = useCallback(
		(user: UserRow, intent: string) => {
			fetcher.submit(
				{ documentId: user.documentId, [INTENT_FIELD]: intent },
				{ method: "post" },
			);
		},
		[fetcher],
	);

	// Las acciones de la fila salvo "Ver detalles": las mismas pinta el pie del
	// panel de detalle, así que fila y panel no pueden ofrecer cosas distintas.
	const rowActions = useMemo<DataTableAction<UserRow>[]>(
		() => [
			defaultActions.edit<UserRow>((user) =>
				navigate(`/dashboard/usuarios/${user.documentId}/editar`),
			),
			{
				icon: KeyRound,
				label: "Restablecer contraseña",
				// Una cuenta archivada no puede entrar: la contraseña se atiende al
				// restaurarla, no antes.
				show: (user) => !user.archivedAt,
				onClick: (user) =>
					setResetTarget({
						documentId: user.documentId,
						name: fullNameOf(user) || user.email,
					}),
			},
			{
				getIcon: (user) => (user.archivedAt ? ArchiveRestore : Archive),
				label: (user) => (user.archivedAt ? "Desarchivar" : "Archivar"),
				onClick: (user) =>
					submitIntent(
						user,
						user.archivedAt ? USER_INTENTS.unarchive : USER_INTENTS.archive,
					),
			},
			{
				icon: Trash2,
				label: "Eliminar definitivamente",
				variant: "danger",
				// El servicio impone la misma regla; aquí solo se evita ofrecer una
				// acción que fallaría.
				show: (user) => Boolean(user.archivedAt),
				onClick: (user) => setPendingDelete(user),
			},
		],
		[navigate, submitIntent],
	);

	const actions = useMemo<DataTableAction<UserRow>[]>(
		() => [
			defaultActions.view<UserRow>((user) => setDetailId(user.documentId)),
			...rowActions,
		],
		[rowActions],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Usuarios"
				description="Gestión de las cuentas con acceso a la herramienta."
				actions={
					<Button asChild>
						<Link to="/dashboard/usuarios/nuevo">
							<Plus className="h-4 w-4" />
							Nuevo usuario
						</Link>
					</Button>
				}
				collapseActionsOnMobile
			/>

			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="w-full sm:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por nombre, correo o teléfono"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Select
						value={role || ANY_ROLE}
						onValueChange={(value) =>
							updateParams({
								role: value === ANY_ROLE ? null : value,
								page: null,
							})
						}
					>
						<SelectTrigger className="w-44">
							<SelectValue placeholder="Rol" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ANY_ROLE}>Todos los roles</SelectItem>
							{ROLES.map((value) => (
								<SelectItem key={value} value={value}>
									{ROLE_FILTER_LABELS[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select
						value={trainer || ANY_TRAINER}
						onValueChange={(value) =>
							updateParams({
								trainer: value === ANY_TRAINER ? null : value,
								page: null,
							})
						}
					>
						<SelectTrigger className="w-44">
							<SelectValue placeholder="Capacitador" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ANY_TRAINER}>Con y sin perfil</SelectItem>
							<SelectItem value="yes">Capacitadores</SelectItem>
							<SelectItem value="no">Sin perfil</SelectItem>
						</SelectContent>
					</Select>

					{/* Solo con alcance global. Para un titular el filtro sería
					    redundante —el alcance ya lo aplica— y engañoso: sugeriría que
					    puede consultar otras dependencias. */}
					{canFilterByDependency && (
						<Select
							value={dependency || ANY_DEPENDENCY}
							onValueChange={(value) =>
								updateParams({
									dependency: value === ANY_DEPENDENCY ? null : value,
									page: null,
								})
							}
						>
							<SelectTrigger className="w-56">
								<SelectValue placeholder="Dependencia" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ANY_DEPENDENCY}>
									Todas las dependencias
								</SelectItem>
								{dependencies.map((item) => (
									<SelectItem key={item.documentId} value={item.documentId}>
										{item.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

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
			</div>

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={rows}
					columns={columns}
					actions={actions}
					emptyState={{
						icon: UsersRound,
						title: "Sin usuarios",
						description:
							"No hay cuentas que coincidan con la búsqueda o los filtros aplicados.",
					}}
					mobileCard={{
						title: (user) => fullNameOf(user) || "Sin nombre",
						description: (user) => user.email,
						content: (user) => (
							<div className="flex flex-wrap items-center gap-2">
								<RoleBadge role={user.role} />
								<StatusBadge archivedAt={user.archivedAt} />
								{user.phone && (
									<span className="text-muted-foreground text-sm">
										{user.phone}
									</span>
								)}
							</div>
						),
					}}
					// `totalPages` lo calcula el servidor al construir la respuesta: la
					// tabla ya no repite el Math.ceil ni puede discrepar del listado.
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
					// Con onSort presente, DataTable delega el orden en vez de
					// reordenar en memoria la página visible.
					onSort={(key, direction) =>
						updateParams({ sortBy: key, sortDir: direction, page: null })
					}
					onRowClick={(user) => setDetailId(user.documentId)}
				/>
			</div>

			<UserDetailsSheet
				user={detailUser}
				onOpenChange={(open) => {
					if (!open) setDetailId(null);
				}}
				actions={rowActions}
			/>

			<ResetPasswordDialog
				user={resetTarget}
				onOpenChange={(open) => {
					if (!open) setResetTarget(null);
				}}
			/>

			<ConfirmDialog
				open={Boolean(pendingDelete)}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(null);
				}}
				title="Eliminar definitivamente"
				description={
					pendingDelete
						? `Se eliminará la cuenta de ${pendingDelete.email}. Esta acción no se puede deshacer.`
						: ""
				}
				confirmLabel="Eliminar"
				destructive
				onConfirm={() => {
					if (pendingDelete) submitIntent(pendingDelete, USER_INTENTS.delete);
					setPendingDelete(null);
				}}
			/>
		</div>
	);
}
