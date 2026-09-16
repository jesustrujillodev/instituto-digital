import type { LucideIcon } from "lucide-react";
import type { Role } from "@/shared/rules/atoms.rules";

export interface NavItem {
	readonly label: string;
	/** Ausente ⇒ grupo contenedor (no navegable). */
	readonly path?: string;
	readonly icon?: LucideIcon;
	/** Ausente ⇒ visible para cualquier rol autenticado (el layout ya exige sesión). */
	readonly roles?: readonly Role[];
	/**
	 * Visible ADEMÁS para quien tenga perfil de capacitador activo.
	 *
	 * Existe porque el catálogo de capacitadores es la primera pantalla cuya
	 * condición de entrada no se expresa con una lista de roles: sin esto, un
	 * participante con perfil no vería el enlace a una pantalla a la que sí
	 * entra, que es peor que no tenerla.
	 */
	readonly trainer?: boolean;
	readonly children?: readonly NavItem[];
}

/** Bloque de la barra con su propia etiqueta; sin etiqueta va como cabecera. */
export interface NavSection {
	readonly label?: string;
	/**
	 * Ausente ⇒ visible para cualquier rol. A diferencia de `NavItem`, no admite
	 * `trainer`: un capacitador con rol de plataforma no debe recibir también el
	 * bloque de gestión de dependencia.
	 */
	readonly roles?: readonly Role[];
	readonly items: readonly NavItem[];
}
