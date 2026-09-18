import { useCallback, useEffect, useState } from "react";
import {
	serializeViewMode,
	type ViewMode,
	type ViewModeScreen,
} from "@/shared/view-mode/view-mode";

/**
 * Disposición cuadrícula/lista de una pantalla.
 *
 * El valor inicial llega del loader; cambiarlo no pide nada al servidor, solo
 * reescribe la cookie para que la próxima carga lo pinte igual.
 */
export function useViewMode(screen: ViewModeScreen, initial: ViewMode) {
	const [mode, setMode] = useState(initial);

	useEffect(() => setMode(initial), [initial]);

	const change = useCallback(
		(next: ViewMode) => {
			setMode(next);
			// biome-ignore lint/suspicious/noDocumentCookie: preferencia de vista sin datos sensibles; la lee el loader.
			document.cookie = serializeViewMode(screen, next);
		},
		[screen],
	);

	return [mode, change] as const;
}
