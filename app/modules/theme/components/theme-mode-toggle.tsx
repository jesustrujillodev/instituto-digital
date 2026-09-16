import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { ThemeMode } from "../domain/theme.types";
import { useThemeMode } from "../hooks/use-theme-mode";

const OPTIONS = [
	{ mode: "light", label: "Claro", icon: Sun },
	{ mode: "dark", label: "Oscuro", icon: Moon },
	{ mode: "system", label: "Sistema", icon: Monitor },
] as const satisfies readonly {
	mode: ThemeMode;
	label: string;
	icon: unknown;
}[];

/** Icono del modo activo. Con `system` se muestra el monitor, no una suposición. */
function ActiveIcon({ mode }: { mode: ThemeMode }) {
	const Icon = OPTIONS.find((option) => option.mode === mode)?.icon ?? Monitor;
	return <Icon />;
}

/**
 * Selector de modo claro/oscuro/sistema. Es el mismo en todas las superficies
 * (landing, login, catálogo y header del dashboard): allí va junto al menú de
 * cuenta, no dentro, para que cambiar de modo siga siendo cosa de un clic.
 */
export function ThemeModeToggle() {
	const { mode, setMode } = useThemeMode();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Cambiar tema">
					<ActiveIcon mode={mode} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{OPTIONS.map(({ mode: value, label, icon: Icon }) => (
					<DropdownMenuItem key={value} onSelect={() => setMode(value)}>
						<Icon />
						{label}
						{mode === value && <Check className="ml-auto size-4" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
