import { useEffect, useRef, useState } from "react";

/** Una espera más corta que esto no se nota: enseñar algo solo parpadearía. */
export const PENDING_SHOW_DELAY_MS = 150;
/** Lo que se queda a la vista, una vez visible, para leerse como señal. */
export const PENDING_MIN_VISIBLE_MS = 300;

/**
 * `active`, pero sin destellos: se enciende si dura más de `delayMs` y, una vez
 * encendido, no se apaga antes de `minVisibleMs`.
 */
export function useDelayedFlag(
	active: boolean,
	delayMs = PENDING_SHOW_DELAY_MS,
	minVisibleMs = PENDING_MIN_VISIBLE_MS,
): boolean {
	const [visible, setVisible] = useState(false);
	const shownAt = useRef(0);

	useEffect(() => {
		if (active && !visible) {
			const timer = setTimeout(() => {
				shownAt.current = performance.now();
				setVisible(true);
			}, delayMs);
			return () => clearTimeout(timer);
		}

		if (!active && visible) {
			const elapsed = performance.now() - shownAt.current;
			const timer = setTimeout(
				() => setVisible(false),
				Math.max(0, minVisibleMs - elapsed),
			);
			return () => clearTimeout(timer);
		}
	}, [active, visible, delayMs, minVisibleMs]);

	return visible;
}
