export { action } from "./index.action";
export { loader } from "./index.loader";

import { ChevronRight, KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { useSubmit } from "react-router";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { ChangePasswordDialog } from "../../components/change-password-dialog";
import { DependencyHistory } from "../../components/dependency-history";
import { AccountRoleBadge } from "../../components/user-badges";
import { fullNameOf, initialsOf } from "../../utils/to-user-rows";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Mi perfil" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Mi perfil" }];
}

function Dato({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="text-sm">{value}</dd>
		</div>
	);
}

export default function PerfilPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { user, dependencyName, history },
	} = loaderData;

	// Un externo no tiene número de empleado, puesto ni dependencia: sus filas
	// dirían "—" siempre.
	const internal = user.type === "INTERNAL";
	// Una sola entrada es el alta, que ya dice el campo Dependencia.
	const transferred = history.some((entry) => entry.fromDependencyName);

	// En un diálogo: abierto en la página, parecía la tarea del perfil.
	const [changingPassword, setChangingPassword] = useState(false);

	// Navegación completa y no fetcher: la acción borra las cookies y redirige
	// al login, igual que "Cerrar sesión".
	const submit = useSubmit();
	const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader title="Mi perfil" />

			<Card>
				<CardContent className="flex flex-col gap-6">
					<div className="flex items-center gap-4">
						<Avatar size="lg">
							{user.photoUrl && <AvatarImage src={user.photoUrl} alt="" />}
							<AvatarFallback>{initialsOf(user)}</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<h2 className="text-balance font-medium text-base">
								{fullNameOf(user) || "Sin nombre"}
							</h2>
							<p className="truncate text-muted-foreground text-sm">
								{user.email}
							</p>
						</div>
						<div className="shrink-0 self-start">
							<AccountRoleBadge role={user.role} type={user.type} />
						</div>
					</div>

					{internal && (
						<div className="flex flex-col gap-3">
							<dl className="grid gap-4 sm:grid-cols-3">
								<Dato
									label="Número de empleado"
									value={user.employeeNumber ?? "—"}
								/>
								<Dato label="Puesto" value={user.jobTitle ?? "—"} />
								<Dato
									label="Dependencia"
									value={dependencyName ?? "Sin asignar"}
								/>
							</dl>

							{dependencyName && (
								<p className="text-muted-foreground text-sm">
									Si cambias de área, pide tu traslado al titular o auxiliar de
									tu dependencia.
								</p>
							)}

							{transferred && (
								<details className="group">
									<summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
										<ChevronRight
											aria-hidden="true"
											className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
										/>
										Historial de adscripción
									</summary>
									<div className="pt-3">
										<DependencyHistory entries={history} />
									</div>
								</details>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardContent className="flex flex-col gap-6">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-1">
							<h2 className="font-medium text-base">Contraseña</h2>
							<p className="text-muted-foreground text-sm">
								Cámbiala si crees que alguien más la conoce.
							</p>
						</div>
						<Button variant="outline" onClick={() => setChangingPassword(true)}>
							<KeyRound aria-hidden="true" />
							Cambiar contraseña
						</Button>
					</div>

					<Separator />

					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-1">
							<h2 className="font-medium text-base">Sesiones</h2>
							<p className="text-muted-foreground text-sm">
								Sal de la plataforma en todos tus dispositivos, incluido este.
							</p>
						</div>
						<Button variant="outline" onClick={() => setConfirmLogoutAll(true)}>
							<LogOut aria-hidden="true" />
							Cerrar todas mis sesiones
						</Button>
					</div>
				</CardContent>
			</Card>

			<ChangePasswordDialog
				open={changingPassword}
				onOpenChange={setChangingPassword}
			/>

			<ConfirmDialog
				open={confirmLogoutAll}
				onOpenChange={setConfirmLogoutAll}
				title="Cerrar todas mis sesiones"
				description="Se cerrará tu sesión en todos los dispositivos, también en este. Tendrás que volver a iniciar sesión."
				confirmLabel="Cerrar sesiones"
				destructive
				onConfirm={() =>
					submit(null, { method: "post", action: "/cerrar-sesiones" })
				}
			/>
		</div>
	);
}
