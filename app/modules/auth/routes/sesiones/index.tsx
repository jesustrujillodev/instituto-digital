export { action } from "./index.action";
export { loader } from "./index.loader";

import {
	Eraser,
	MonitorSmartphone,
	ShieldAlert,
	ShieldX,
	UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import {
	DataTable,
	type DataTableAction,
} from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { TextInput } from "@/shared/components/common/text-input";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
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
	LockdownDialog,
	type LockdownRequest,
} from "../../components/lockdown-dialog";
import type { SessionSummary } from "../../domain/auth.types";
import { describeUserAgent } from "../../utils/describe-user-agent";
import {
	INTENT_FIELD,
	SESSION_INTENTS,
	type SessionMonitorActionData,
} from "../../utils/session-monitor-form";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

const dateTime = (value: Date | string) =>
	new Date(value).toLocaleString("es-MX", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

/** "45 segundos" / "5 minutos" — para redactar la ventana de revocación. */
const humanizeSeconds = (seconds: number) => {
	if (seconds < 60) return `${seconds} segundos`;

	const minutes = Math.round(seconds / 60);
	return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
};

/** Revocación a la espera de confirmación, con la fila sobre la que se abrió. */
type PendingRevoke =
	| { kind: "session"; session: SessionSummary }
	| { kind: "user"; session: SessionSummary }
	| { kind: "all" };

/**
 * Copia del diálogo de confirmación. La latencia se cuenta aquí y no en la
 * cabecera: es cuando alguien decide si le basta.
 *
 * Revocar UNA sesión corta al expirar su access token; por usuario o todas
 * sube el epoch y solo espera a que se propague (docs/auth/02 §latencias).
 */
const revokeCopy = (
	pending: PendingRevoke,
	{
		revocationWindow,
		propagationWindow,
		currentUserId,
	}: {
		revocationWindow: string;
		propagationWindow: string;
		currentUserId: number;
	},
) => {
	switch (pending.kind) {
		case "session":
			return {
				title: "Revocar sesión",
				description: `${pending.session.ownerEmail} tendrá que volver a iniciar sesión en ese dispositivo en ${revocationWindow} como máximo.`,
				confirmLabel: "Revocar",
			};
		case "user": {
			const ownAccount =
				pending.session.userId === currentUserId
					? " Es tu cuenta: también se cerrará esta sesión."
					: "";
			return {
				title: "Revocar sesiones del usuario",
				description: `${pending.session.ownerEmail} queda fuera de todos sus dispositivos en ${propagationWindow} como máximo.${ownAccount}`,
				confirmLabel: "Revocar",
			};
		}
		case "all":
			return {
				title: "Revocar todas las sesiones",
				description: `Todas las personas tendrán que volver a iniciar sesión en ${propagationWindow} como máximo. La tuya sigue activa.`,
				confirmLabel: "Revocar todas",
			};
	}
};

export const handle = {
	breadcrumb: () => [{ label: "Sesiones" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Sesiones" }];
}

export default function SesionesPage({ loaderData }: Route.ComponentProps) {
	const {
		data: {
			auth,
			sessions,
			filters,
			revocationWindowS,
			propagationS,
			securityState,
		},
		pagination,
	} = loaderData;
	const { search, status, sortBy, sortDir } = filters;
	const { lockdownAt, lockdownScope } = securityState;

	const [, setSearchParams] = useSearchParams();
	const [pending, setPending] = useState<PendingRevoke | null>(null);
	const [lockdownOpen, setLockdownOpen] = useState(false);

	// Un solo fetcher para todas las mutaciones: sigue montado aunque la
	// revalidación cambie lo que se pinta, así que el toast siempre llega.
	const fetcher = useFetcher<SessionMonitorActionData>();
	useFetcherToast(fetcher);
	const isBusy = fetcher.state !== "idle";

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

	// ── Mutaciones ──────────────────────────────────────────────────────────────
	const submit = (payload: Record<string, string>) => {
		fetcher.submit(payload, { method: "post" });
	};

	const confirmPending = () => {
		if (!pending) return;

		if (pending.kind === "session") {
			submit({
				[INTENT_FIELD]: SESSION_INTENTS.revokeSession,
				sessionId: pending.session.id,
			});
		} else if (pending.kind === "user") {
			submit({
				[INTENT_FIELD]: SESSION_INTENTS.revokeUser,
				userId: String(pending.session.userId),
			});
		} else {
			submit({ [INTENT_FIELD]: SESSION_INTENTS.revokeAll });
		}

		setPending(null);
	};

	const activateLockdown = ({ scope, reason, confirmation }: LockdownRequest) =>
		submit({
			[INTENT_FIELD]: SESSION_INTENTS.lockdown,
			scope,
			reason,
			confirmation,
		});

	// ── Tabla ───────────────────────────────────────────────────────────────────
	// `sortable: false` en todo lo que no está en SESSION_SORT_FIELDS: la tabla
	// permite ordenar por defecto, y una columna fuera de la allowlist del
	// dominio produciría un 400 al recargar el loader.
	const columns = useMemo(
		() => [
			columnHelpers.custom<SessionSummary>(
				"ownerEmail",
				"Usuario",
				(session) => (
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<span className="font-medium text-sm text-foreground">
								{session.ownerFullName || "Sin nombre"}
							</span>
							{session.isCurrent && (
								<Badge variant="outline">Esta sesión</Badge>
							)}
						</div>
						<span className="text-muted-foreground text-xs">
							{session.ownerEmail}
						</span>
					</div>
				),
				{ sortable: false },
			),
			columnHelpers.text<SessionSummary>("ipAddress", "IP", {
				sortable: false,
			}),
			columnHelpers.custom<SessionSummary>(
				"userAgent",
				"Dispositivo",
				(session) => (
					// El UA completo queda en el title: la etiqueta es para reconocer
					// el dispositivo, no para investigarlo.
					<span
						className="whitespace-nowrap text-sm"
						title={session.userAgent ?? undefined}
					>
						{describeUserAgent(session.userAgent)}
					</span>
				),
				{ sortable: false },
			),
			columnHelpers.custom<SessionSummary>("createdAt", "Inicio", (session) => (
				<span className="text-muted-foreground text-sm">
					{dateTime(session.createdAt)}
				</span>
			)),
			columnHelpers.custom<SessionSummary>("expiresAt", "Expira", (session) => (
				<div className="flex items-center gap-2 whitespace-nowrap">
					<span className="text-muted-foreground text-sm">
						{dateTime(session.expiresAt)}
					</span>
					{session.isExpired && <Badge variant="destructive">Expirada</Badge>}
				</div>
			)),
		],
		[],
	);

	const actions = useMemo<DataTableAction<SessionSummary>[]>(
		() => [
			{
				icon: ShieldX,
				label: "Revocar sesión",
				variant: "danger",
				// Revocar la sesión desde la que estás operando te expulsa del panel.
				// Para eso existe /cerrar-sesion, que además limpia las cookies.
				disabled: (session) => session.isCurrent,
				onClick: (session) => setPending({ kind: "session", session }),
			},
			{
				icon: UserX,
				label: "Revocar las del usuario",
				variant: "danger",
				onClick: (session) => setPending({ kind: "user", session }),
			},
		],
		[],
	);

	const pendingCopy =
		pending &&
		revokeCopy(pending, {
			revocationWindow: humanizeSeconds(revocationWindowS),
			propagationWindow: humanizeSeconds(propagationS),
			currentUserId: auth.userId,
		});

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Sesiones"
				description="Quién tiene acceso abierto a la plataforma."
				actions={
					<>
						<Button
							variant="outline"
							disabled={isBusy}
							onClick={() => setPending({ kind: "all" })}
						>
							<ShieldX className="h-4 w-4" />
							Revocar todas
						</Button>
						{!lockdownAt && (
							<Button
								variant="destructive"
								disabled={isBusy}
								onClick={() => setLockdownOpen(true)}
							>
								<ShieldAlert className="h-4 w-4" />
								Lockdown…
							</Button>
						)}
					</>
				}
				collapseActionsOnMobile
			/>

			{/* La fecha y el alcance ya los pinta el banner del layout: aquí solo
			    queda lo que se puede hacer al respecto (docs/auth/03 §7). */}
			{lockdownAt && (
				<Alert
					variant="destructive"
					className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<AlertDescription className="flex items-center gap-2 text-destructive">
						<ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
						{lockdownScope === "except-admin" ? (
							"Solo los superadministradores pueden entrar mientras dure el lockdown."
						) : (
							<span>
								Solo se levanta en el servidor:{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-foreground">
									bun run lockdown lift
								</code>
							</span>
						)}
					</AlertDescription>
					{lockdownScope === "except-admin" && (
						<Button
							variant="outline"
							disabled={isBusy}
							onClick={() => submit({ [INTENT_FIELD]: SESSION_INTENTS.lift })}
						>
							Levantar lockdown
						</Button>
					)}
				</Alert>
			)}

			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="w-full sm:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por nombre o correo"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{/* Solo cuando las expiradas están a la vista: el botón actúa sobre
					    lo que se está mirando. */}
					{status !== "active" && (
						<Button
							variant="ghost"
							disabled={isBusy}
							onClick={() =>
								submit({ [INTENT_FIELD]: SESSION_INTENTS.cleanupExpired })
							}
						>
							<Eraser className="h-4 w-4" />
							Limpiar expiradas
						</Button>
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
							<SelectItem value="active">Activas</SelectItem>
							<SelectItem value="expired">Expiradas</SelectItem>
							<SelectItem value="all">Todas</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={sessions}
					columns={columns}
					actions={actions}
					emptyState={{
						icon: MonitorSmartphone,
						title: "Sin sesiones",
						description:
							"No hay sesiones que coincidan con la búsqueda o los filtros aplicados.",
					}}
					mobileCard={{
						title: (session) => session.ownerFullName || "Sin nombre",
						description: (session) => session.ownerEmail,
						content: (session) => (
							<div className="flex flex-col gap-2">
								{(session.isCurrent || session.isExpired) && (
									<div className="flex flex-wrap items-center gap-2">
										{session.isCurrent && (
											<Badge variant="outline">Esta sesión</Badge>
										)}
										{session.isExpired && (
											<Badge variant="destructive">Expirada</Badge>
										)}
									</div>
								)}
								<span className="text-muted-foreground text-sm">
									{[session.ipAddress, describeUserAgent(session.userAgent)]
										.filter(Boolean)
										.join(" · ")}
								</span>
								<span className="text-muted-foreground text-xs">
									Expira el {dateTime(session.expiresAt)}
								</span>
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
					// Con onSort presente, DataTable delega el orden en vez de
					// reordenar en memoria la página visible.
					onSort={(key, direction) =>
						updateParams({ sortBy: key, sortDir: direction, page: null })
					}
				/>
			</div>

			<ConfirmDialog
				open={Boolean(pending)}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
				title={pendingCopy?.title ?? ""}
				description={pendingCopy?.description ?? ""}
				confirmLabel={pendingCopy?.confirmLabel}
				destructive
				onConfirm={confirmPending}
			/>

			<LockdownDialog
				open={lockdownOpen}
				onOpenChange={setLockdownOpen}
				busy={isBusy}
				onConfirm={activateLockdown}
			/>
		</div>
	);
}
