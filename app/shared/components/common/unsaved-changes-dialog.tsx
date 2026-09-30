import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
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
import { Button } from "@/shared/components/ui/button";

/**
 * Avisa antes de abandonar una pantalla con cambios sin guardar.
 *
 * Hacen falta los dos mecanismos: `useBlocker` cubre la navegación interna del
 * router (que nunca dispara eventos del navegador) y `beforeunload` cubre
 * cerrar la pestaña o recargar.
 *
 * La navegación interna —Cancelar, la flecha de volver, el menú lateral— se
 * confirma con este diálogo. Cerrar la pestaña o recargar solo admite el aviso
 * nativo: el navegador no permite sustituirlo por uno propio.
 *
 * @param when Normalmente `formState.isDirty && !isSubmitting`.
 * @param onSave Si la pantalla sabe guardar sin salir, el diálogo ofrece
 *   «Guardar y salir». Devuelve `false` si no se guardó: entonces se queda.
 */
export function UnsavedChangesDialog({
	when,
	onSave,
}: {
	when: boolean;
	onSave?: () => Promise<boolean>;
}) {
	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			when && currentLocation.pathname !== nextLocation.pathname,
	);
	const [saving, setSaving] = useState(false);

	// Al confirmar, el diálogo también se cierra y dispara `onOpenChange(false)`.
	// Si eso llamara a `reset()` después de `proceed()`, un retroceso del
	// navegador —que avanza en diferido— encontraría el blocker libre, volvería a
	// bloquearse y reabriría el diálogo.
	const isProceeding = useRef(false);

	useEffect(() => {
		if (blocker.state === "blocked") isProceeding.current = false;
	}, [blocker.state]);

	useEffect(() => {
		if (!when) return;

		const handler = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", handler);

		return () => window.removeEventListener("beforeunload", handler);
	}, [when]);

	const proceed = () => {
		if (blocker.state !== "blocked") return;
		isProceeding.current = true;
		blocker.proceed();
	};

	const saveAndLeave = async () => {
		if (!onSave) return;
		setSaving(true);
		const saved = await onSave();
		setSaving(false);
		if (saved) proceed();
		else if (blocker.state === "blocked") blocker.reset();
	};

	return (
		<AlertDialog
			open={blocker.state === "blocked"}
			onOpenChange={(open) => {
				if (open || saving || isProceeding.current) return;
				if (blocker.state === "blocked") blocker.reset();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Salir sin guardar?</AlertDialogTitle>
					<AlertDialogDescription>
						{onSave
							? "Tienes cambios sin guardar. Guárdalos antes de salir o se perderán."
							: "Tienes cambios sin guardar. Si sales ahora, se perderán."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={saving}>
						Seguir editando
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={saving}
						onClick={proceed}
					>
						Salir sin guardar
					</AlertDialogAction>
					{onSave && (
						<Button
							type="button"
							disabled={saving}
							onClick={() => void saveAndLeave()}
						>
							{saving && (
								<Loader2 className="animate-spin" aria-hidden="true" />
							)}
							{saving ? "Guardando…" : "Guardar y salir"}
						</Button>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
