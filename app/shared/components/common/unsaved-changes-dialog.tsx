import { useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Avisa antes de abandonar una pantalla con cambios sin guardar.
 *
 * Hacen falta los dos mecanismos: `useBlocker` cubre la navegación interna del
 * router (que nunca dispara eventos del navegador) y `beforeunload` cubre
 * cerrar la pestaña o recargar.
 *
 * La navegación interna —Cancelar, la flecha de volver, el menú lateral— se
 * confirma con `ConfirmDialog`. Cerrar la pestaña o recargar solo admite el
 * aviso nativo: el navegador no permite sustituirlo por uno propio.
 *
 * @param when Normalmente `formState.isDirty && !isSubmitting`.
 */
export function UnsavedChangesDialog({ when }: { when: boolean }) {
	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			when && currentLocation.pathname !== nextLocation.pathname,
	);

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

	return (
		<ConfirmDialog
			open={blocker.state === "blocked"}
			onOpenChange={(open) => {
				if (open || isProceeding.current) return;
				if (blocker.state === "blocked") blocker.reset();
			}}
			title="¿Salir sin guardar?"
			description="Tienes cambios sin guardar. Si sales ahora, se perderán."
			confirmLabel="Salir sin guardar"
			cancelLabel="Seguir editando"
			destructive
			onConfirm={() => {
				if (blocker.state !== "blocked") return;
				isProceeding.current = true;
				blocker.proceed();
			}}
		/>
	);
}
