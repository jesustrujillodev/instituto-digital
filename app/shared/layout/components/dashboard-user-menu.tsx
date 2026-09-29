import { LogOut, UserRound } from "lucide-react";
import { Link, useSubmit } from "react-router";
import { ROLE_LABELS } from "@/shared/auth/role-labels";
import type { SessionUser } from "@/shared/auth/session-user";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

/** Iniciales para el AvatarFallback a partir del email (no hay nombre en la sesión). */
function initialsFromEmail(email: string): string {
	return email.slice(0, 2).toUpperCase();
}

/**
 * El externo lleva `USER` en la base sin ser participante; es el único rol sin
 * dependencia además del de plataforma (CHECK `users_type_coherence`).
 */
const accountLabelOf = (user: SessionUser) =>
	user.role === "USER" && !user.hasDependency
		? "Capacitador externo"
		: ROLE_LABELS[user.role];

/**
 * Menú de cuenta, en la esquina superior derecha del header del dashboard.
 *
 * El disparador es solo el avatar: la identidad completa vive dentro del menú
 * para no quitarle ancho al breadcrumb. El tema NO está aquí —tiene su propio
 * botón al lado— porque se cambia más a menudo que la sesión; así queda a un
 * clic y "Cerrar sesión" a dos, lejos de un clic accidental.
 */
export function DashboardUserMenu({ user }: { user: SessionUser }) {
	const submit = useSubmit();

	// El logout es una mutación: va por POST a la ruta de acción, que borra la
	// sesión en la base y expira ambas cookies. Nunca un <Link>.
	const logout = () =>
		submit(null, { method: "post", action: "/cerrar-sesion" });

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Cuenta de ${user.email}`}
				>
					<Avatar>
						<AvatarFallback className="font-medium text-xs">
							{initialsFromEmail(user.email)}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>

			{/* El contenido hereda por defecto el ancho del disparador; con un
			    avatar de 36px eso cortaría el correo, así que se suelta a `w-auto`
			    con un tope para que un correo largo trunque en vez de estirarlo. */}
			<DropdownMenuContent align="end" className="w-auto min-w-56 max-w-72">
				<DropdownMenuLabel className="font-normal">
					<div className="grid text-left text-sm leading-tight">
						<span className="truncate font-medium">{user.email}</span>
						<span className="truncate text-muted-foreground text-xs">
							{accountLabelOf(user)}
						</span>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/dashboard/perfil">
						<UserRound />
						Mi perfil
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={logout}>
					<LogOut />
					Cerrar sesión
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
