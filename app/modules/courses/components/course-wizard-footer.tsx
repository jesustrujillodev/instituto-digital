import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/shared/components/ui/button";

interface CourseWizardFooterProps {
	formId: string;
	/** `null` en el primer paso: no hay atrás dentro del alta. */
	backTo: string | null;
	isSubmitting: boolean;
	/** La revisión del alta publica; el último paso de la edición guarda y sale. */
	submitKind: "next" | "publish" | "save";
	/** Publicar exige que no quede nada pendiente. */
	canSubmit?: boolean;
}

/**
 * Avanzar y retroceder.
 *
 * Pegajoso en móvil, donde el encabezado guarda sus acciones en un menú: la
 * acción que mueve el alta tiene que quedar siempre al alcance del pulgar.
 */
export function CourseWizardFooter({
	formId,
	backTo,
	isSubmitting,
	submitKind,
	canSubmit = true,
}: CourseWizardFooterProps) {
	return (
		<div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center gap-2 border-border border-t bg-background px-4 py-3 md:static md:mx-0 md:justify-end md:border-t-0 md:px-0">
			{backTo ? (
				<Button variant="outline" size="lg" asChild>
					<Link to={backTo}>
						<ArrowLeft aria-hidden="true" />
						Atrás
					</Link>
				</Button>
			) : (
				<div className="md:hidden" />
			)}

			<Button
				type="submit"
				form={formId}
				size="lg"
				disabled={isSubmitting || !canSubmit}
				className="flex-1 md:flex-none"
			>
				{submitKind === "publish" ? (
					<>
						<Send aria-hidden="true" />
						{isSubmitting ? "Publicando…" : "Publicar curso"}
					</>
				) : submitKind === "save" ? (
					<>
						<Check aria-hidden="true" />
						{isSubmitting ? "Guardando…" : "Guardar cambios"}
					</>
				) : (
					<>
						{isSubmitting ? "Guardando…" : "Continuar"}
						<ArrowRight aria-hidden="true" />
					</>
				)}
			</Button>
		</div>
	);
}
