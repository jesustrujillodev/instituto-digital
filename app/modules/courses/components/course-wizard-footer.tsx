import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";

interface CourseWizardFooterProps {
	formId: string;
	/** `null` en el primer paso: no hay atrás dentro del alta. */
	backTo: string | null;
	/** El paso al que lleva «Guardar y continuar»; `null` cuando publica o sale. */
	nextTitle?: string | null;
	/** Hay un guardado o una salida en curso, lance quien lo lance. */
	busy: boolean;
	/** Qué hace la acción de este pie si la lanzó él: guardar o abrir el destino. */
	pendingPhase: "saving" | "opening" | null;
	/** La revisión del alta publica; el último paso de la edición guarda y sale. */
	submitKind: "next" | "publish" | "save";
	/** A dónde sale el último paso de la edición: «a Cursos», «a Impartición». */
	finishLabel?: string;
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
	busy,
	pendingPhase,
	submitKind,
	finishLabel = "a Capacitaciones",
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
				disabled={busy || !canSubmit}
				pending={pendingPhase !== null}
				className={cn(
					"flex-1 md:flex-none",
					!nextTitle && "md:ml-auto",
					nextTitle && "md:ml-2",
				)}
			>
				{submitKind === "publish" ? (
					<>
						<Send aria-hidden="true" />
						{pendingPhase ? "Publicando…" : "Publicar capacitación"}
					</>
				) : submitKind === "save" ? (
					<>
						<Check aria-hidden="true" />
						{pendingPhase === "opening"
							? "Saliendo…"
							: pendingPhase === "saving"
								? "Guardando…"
								: `Guardar y salir ${finishLabel}`}
					</>
				) : (
					<>
						{pendingPhase === "opening"
							? "Abriendo el paso…"
							: pendingPhase === "saving"
								? "Guardando…"
								: "Guardar y continuar"}
						<ArrowRight aria-hidden="true" />
					</>
				)}
			</Button>
		</div>
	);
}
