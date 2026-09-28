import { TrainerProfileSection } from "@/modules/trainers/components/trainer-profile-section";
import type { DataTableAction } from "@/shared/components/common/data-table";
import { SheetRowActions } from "@/shared/components/common/sheet-row-actions";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import { fullNameOf, initialsOf, type UserRow } from "../utils/to-user-rows";
import { AccountRoleBadge, StatusBadge, TrainerBadge } from "./user-badges";

interface UserDetailsSheetProps {
	/** `null` cierra el panel; el dato viene del loader del listado. */
	user: UserRow | null;
	onOpenChange: (open: boolean) => void;
	/** Las acciones de la fila sobre la cuenta, sin "Ver detalles". */
	actions: DataTableAction<UserRow>[];
	/** Las del perfil de capacitador: se pintan en su propia sección. */
	trainerActions: DataTableAction<UserRow>[];
}

const dateFormat: Intl.DateTimeFormatOptions = {
	dateStyle: "medium",
	timeStyle: "short",
};

const formatDate = (value: Date | string | null) =>
	value ? new Date(value).toLocaleString("es-MX", dateFormat) : "—";

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</span>
			<span className="text-sm text-foreground">{children}</span>
		</div>
	);
}

/**
 * Detalle de la cuenta con las acciones de su fila al pie.
 *
 * No pide datos al servidor: pinta lo que el loader del listado ya trajo, así
 * que abrirlo es instantáneo y no añade una ruta más al módulo.
 */
export function UserDetailsSheet({
	user,
	onOpenChange,
	actions,
	trainerActions,
}: UserDetailsSheetProps) {
	return (
		<Sheet open={Boolean(user)} onOpenChange={onOpenChange}>
			<SheetContent className="gap-0 overflow-y-auto">
				{user && (
					<>
						<SheetHeader>
							<div className="flex items-center gap-3">
								<Avatar size="lg">
									{user.photoUrl && <AvatarImage src={user.photoUrl} alt="" />}
									<AvatarFallback>{initialsOf(user)}</AvatarFallback>
								</Avatar>
								<div className="flex min-w-0 flex-col">
									<SheetTitle className="truncate">
										{fullNameOf(user) || "Sin nombre"}
									</SheetTitle>
									<SheetDescription className="truncate">
										{user.email}
									</SheetDescription>
								</div>
							</div>
						</SheetHeader>

						<div className="flex flex-wrap items-center gap-2 px-6 pb-5">
							<AccountRoleBadge role={user.role} type={user.type} />
							<TrainerBadge isTrainer={user.isTrainer} />
							<StatusBadge archivedAt={user.archivedAt} />
						</div>

						<TrainerProfileSection item={user} actions={trainerActions} />

						<section
							aria-labelledby={`account-${user.documentId}`}
							className="grid grid-cols-2 gap-x-4 gap-y-5 border-border border-t px-6 py-5"
						>
							<h3
								id={`account-${user.documentId}`}
								className="col-span-2 font-medium text-foreground text-sm"
							>
								Cuenta
							</h3>

							<Field label="Teléfono">{user.phone || "—"}</Field>
							<Field label="Creado">{formatDate(user.createdAt)}</Field>
							<Field label="Última actualización">
								{formatDate(user.updatedAt)}
							</Field>
							{user.archivedAt && (
								<Field label="Archivado">{formatDate(user.archivedAt)}</Field>
							)}
							<div className="col-span-2">
								<Field label="Identificador">
									<code className="break-all font-mono text-xs">
										{user.documentId}
									</code>
								</Field>
							</div>
						</section>

						<SheetRowActions item={user} actions={actions} />
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
