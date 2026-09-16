import { Link } from "react-router";
import { Button } from "@/shared/components/ui/button";

interface FormActionsProps {
	/** `ids.form` — conecta el botón de guardar con el `<form>` sin vivir dentro. */
	formId: string;
	isSubmitting: boolean;
	submitLabel: string;
	/** Etiqueta mientras se envía; por defecto "Guardando…". */
	submittingLabel?: string;
	cancelTo: string;
}

/**
 * Cancelar y guardar de un formulario de pantalla completa.
 *
 * Se pinta dos veces —en el encabezado y al final del formulario— y por eso es
 * un componente: las dos copias tienen que coincidir en etiqueta, destino y
 * estado de envío. Devuelve un fragmento para que quien lo contiene decida la
 * disposición de los botones.
 */
export function FormActions({
	formId,
	isSubmitting,
	submitLabel,
	submittingLabel = "Guardando…",
	cancelTo,
}: FormActionsProps) {
	return (
		<>
			{/* Con cambios pendientes, el enlace lo intercepta UnsavedChangesDialog. */}
			<Button variant="outline" asChild>
				<Link to={cancelTo}>Cancelar</Link>
			</Button>
			{/* form={formId} conecta este botón con el <form> pese a vivir fuera
			    de él: por eso los ids son estables y únicos. */}
			<Button type="submit" form={formId} disabled={isSubmitting}>
				{isSubmitting ? submittingLabel : submitLabel}
			</Button>
		</>
	);
}

/**
 * Segundo punto de guardado, al pie: tras un formulario largo, volver arriba es
 * un trayecto de más, y en móvil es el principal porque el encabezado agrupa sus
 * acciones en un menú.
 */
export function FormFooter({ children }: { children: React.ReactNode }) {
	return (
		<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			{children}
		</div>
	);
}
