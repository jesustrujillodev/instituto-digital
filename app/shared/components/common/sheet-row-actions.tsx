import { cn } from "@/lib/utils";
import type { DataTableAction } from "@/shared/components/common/data-table";
import { Button } from "@/shared/components/ui/button";
import { SheetFooter } from "@/shared/components/ui/sheet";

interface SheetRowActionsProps<T> {
	item: T;
	/**
	 * Las MISMAS acciones de la fila, sin "Ver detalles" (ya se está viendo). La
	 * primera visible es la principal; recibir el arreglo de la tabla y no una
	 * lista propia es lo que impide que panel y fila ofrezcan cosas distintas.
	 */
	actions: DataTableAction<T>[];
}

/**
 * Pie de un panel de detalle con las acciones de su fila.
 *
 * Fijo al fondo del panel: el detalle puede hacer scroll y las acciones tienen
 * que seguir a mano. Dos columnas cuando el panel es ancho; una sola en móvil,
 * donde "Restablecer contraseña" no cabe en media fila.
 */
export function SheetRowActions<T>({ item, actions }: SheetRowActionsProps<T>) {
	const visible = actions.filter((action) => action.show?.(item) ?? true);
	if (visible.length === 0) return null;

	const [primary, ...rest] = visible;

	const renderAction = (action: DataTableAction<T>, isPrimary: boolean) => {
		const Icon = action.getIcon?.(item) ?? action.icon;
		const label =
			typeof action.label === "function" ? action.label(item) : action.label;

		return (
			<Button
				key={label}
				type="button"
				variant={
					isPrimary
						? "default"
						: action.variant === "danger"
							? "destructive"
							: "outline"
				}
				disabled={action.disabled?.(item)}
				onClick={() => action.onClick(item)}
				className={cn(
					"w-full",
					// La principal ocupa la fila entera; si el resto queda impar, la última
					// también, para no dejar un hueco a su lado.
					(isPrimary || (rest.length % 2 === 1 && action === rest.at(-1))) &&
						"@sm/sheet-actions:col-span-2",
				)}
			>
				{Icon && <Icon aria-hidden="true" />}
				{label}
			</Button>
		);
	};

	return (
		<SheetFooter className="@container/sheet-actions sticky bottom-0 mt-auto border-border border-t bg-popover">
			<div className="grid gap-2 @sm/sheet-actions:grid-cols-2">
				{renderAction(primary, true)}
				{rest.map((action) => renderAction(action, false))}
			</div>
		</SheetFooter>
	);
}
