import { useCallback, useEffect, useState } from "react";

export type CloudViewMode = "list" | "grid";

const STORAGE_KEY = "cloud:view-mode";

/**
 * Lista o cuadrícula, recordada por navegador.
 *
 * Arranca en lista —lo que pinta el servidor— y aplica la preferencia guardada
 * al montar: leer `localStorage` durante el render rompería la hidratación.
 * Cualquier acceso puede lanzar (ventana privada, datos bloqueados), y entonces
 * la vista simplemente no se recuerda.
 */
export function useViewMode(): [CloudViewMode, (mode: CloudViewMode) => void] {
	const [mode, setMode] = useState<CloudViewMode>("list");

	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(STORAGE_KEY);
			if (saved === "list" || saved === "grid") setMode(saved);
		} catch {
			// Sin almacenamiento disponible: se queda la vista por defecto.
		}
	}, []);

	const update = useCallback((next: CloudViewMode) => {
		setMode(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// La vista cambia igual; solo no se recordará.
		}
	}, []);

	return [mode, update];
}
