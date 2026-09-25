import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";

interface CourseWizardFooterProps {
	formId: string;
	/** `null` en el primer paso: no hay atrás dentro del alta. */
	backTo: string | null;
	/** El paso al que lleva Continuar; `null` cuando el botón publica o guarda. */
	nextTitle?: string | null;
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
	nextTitle = null,
	isSubmitting,
	submitKind,
	canSubmit = true,
}: CourseWizardFooterProps) {
	return (
		<div className="sticky bottom-0 z-10 -mx-4 mt-8 flex items-center gap-2 border-border border-t bg-background px-4 py-3 md:static md:mx-0 md:mt-10 md:px-0 md:pt-5 md:pb-0">
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

			{nextTitle && (
				<span className="ml-auto hidden text-muted-foreground text-sm md:inline">
					Siguiente: {nextTitle}
				</span>
			)}

			<Button
				type="submit"
				form={formId}
				size="lg"
				disabled={isSubmitting || !canSubmit}
				className={cn(
					"flex-1 md:flex-none",
					!nextTitle && "md:ml-auto",
					nextTitle && "md:ml-2",
				)}
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
