import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { buttonVariants } from "@/shared/components/ui/button";

interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Pinta la acción como destructiva: borrados y cualquier cosa irreversible. */
	destructive?: boolean;
	onConfirm: () => void;
}

/**
 * Confirmación de una acción, en lugar de `window.confirm`.
 *
 * Vale la pena el componente y no el diálogo nativo por tres motivos: el nativo
 * no se puede estilar ni traducir, bloquea el hilo, y algunos navegadores lo
 * suprimen si el usuario marca "no volver a preguntar" — con lo que un borrado
 * permanente pasaría a ejecutarse sin confirmación de ningún tipo.
 *
 * El estado vive FUERA (`open` controlado): quien lo abre suele necesitar
 * recordar sobre qué fila lo abrió, y ese dato no cabe dentro del diálogo.
 */
export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = "Confirmar",
	cancelLabel = "Cancelar",
	destructive = false,
	onConfirm,
}: ConfirmDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction
						className={cn(
							destructive && buttonVariants({ variant: "destructive" }),
						)}
						onClick={onConfirm}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
