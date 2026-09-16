import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { ThemeSummary } from "../domain/theme.types";

/**
 * Cromo fijo, a propósito fuera del tema.
 *
 * Todo lo demás en esta aplicación se pinta con los tokens del tema activo
 * (principio #2 de PRODUCT.md), y este control es la excepción justificada: el
 * builder repinta el documento entero con el BORRADOR mientras se edita, así que
 * un tema a medio hacer —`popover` y `popover-foreground` en el mismo tono— haría
 * ilegible justamente el desplegable que hace falta para salir de ahí y abrir
 * otro tema. Mismo criterio que el picker de ui.shadcn.com/create, que también
 * se pinta en neutros fijos por encima del tema que está previsualizando.
 *
 * El único color del tema que entra aquí es el punto del disparador, que es
 * información: dice de qué color es lo que se está editando.
 */
const PANEL =
	"border-0 bg-neutral-950/80 text-neutral-100 ring-1 ring-neutral-950/80 backdrop-blur-xl dark:bg-neutral-800/90 dark:ring-neutral-700/50";

const ITEM =
	"rounded-lg py-1.5 pr-8 pl-2 font-medium **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 dark:focus:bg-neutral-700/80";

interface ThemePickerProps {
	themes: ThemeSummary[];
	value: string;
	/** Color de marca del tema abierto, para el punto del disparador. */
	swatch: string;
	onChange: (documentId: string) => void;
}

/**
 * Selector de la biblioteca de temas.
 *
 * Disparador de dos líneas —etiqueta arriba, valor abajo— con el color de marca
 * como punto a la derecha, y no un `Select` con su nombre a secas: el nombre de
 * un tema ("Tema nuevo", "Copia de…") no dice nada de lo que se va a abrir, y el
 * color sí.
 *
 * Los de fábrica van en su propio grupo, separados de los propios: son los
 * únicos que no se pueden editar, y agruparlos evita tener que descubrirlo al
 * abrirlos.
 */
export function ThemePicker({
	themes,
	value,
	swatch,
	onChange,
}: ThemePickerProps) {
	const presets = themes.filter((theme) => theme.isPreset);
	const own = themes.filter((theme) => !theme.isPreset);
	const current = themes.find((theme) => theme.documentId === value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"relative w-56 shrink-0 touch-manipulation rounded-lg px-2.5 py-2 text-left ring-1 ring-foreground/10 select-none",
					"hover:bg-muted focus-visible:ring-foreground/50 focus-visible:outline-none",
					"data-[state=open]:bg-muted",
				)}
			>
				<span className="block text-xs text-muted-foreground">Tema</span>
				<span className="block truncate pr-6 text-sm font-medium text-foreground">
					{current?.name ?? "Sin tema"}
				</span>
				<span
					className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 rounded-full ring-1 ring-foreground/15"
					style={{ backgroundColor: swatch }}
					aria-hidden="true"
				/>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="start"
				sideOffset={8}
				className={cn("max-h-92 w-56 rounded-xl p-1.5 shadow-none", PANEL)}
			>
				<DropdownMenuRadioGroup value={value} onValueChange={onChange}>
					{own.length > 0 && (
						<DropdownMenuGroup>
							{own.map((theme) => (
								<DropdownMenuRadioItem
									key={theme.documentId}
									value={theme.documentId}
									className={ITEM}
								>
									<span className="truncate">{theme.name}</span>
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuGroup>
					)}

					{own.length > 0 && presets.length > 0 && (
						<DropdownMenuSeparator className="-mx-1.5 my-1.5 bg-neutral-600 dark:bg-neutral-700" />
					)}

					{presets.length > 0 && (
						<DropdownMenuGroup>
							{presets.map((theme) => (
								<DropdownMenuRadioItem
									key={theme.documentId}
									value={theme.documentId}
									className={ITEM}
								>
									<span className="truncate">{theme.name}</span>
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuGroup>
					)}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
