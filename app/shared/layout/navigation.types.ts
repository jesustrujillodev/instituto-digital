import type { LucideIcon } from "lucide-react";
import type { Role } from "@/shared/rules/atoms.rules";

export interface NavItem {
	readonly label: string;
	/** Ausente ⇒ grupo contenedor (no navegable). */
	readonly path?: string;
	readonly icon?: LucideIcon;
	/** Ausente ⇒ visible para cualquier rol autenticado (el layout ya exige sesión). */
	readonly roles?: readonly Role[];
	readonly children?: readonly NavItem[];
}
