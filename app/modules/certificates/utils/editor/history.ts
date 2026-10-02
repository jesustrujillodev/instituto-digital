/** Cuántos pasos se pueden deshacer. */
export const HISTORY_LIMIT = 100;

export interface History<T> {
	past: T[];
	present: T;
	future: T[];
	/**
	 * Clave del último cambio. Dos cambios seguidos con la misma clave (un
	 * arrastre, el tecleo en un campo) son UN paso al deshacer.
	 */
	coalesceKey: string | null;
}

export const createHistory = <T>(present: T): History<T> => ({
	past: [],
	present,
	future: [],
	coalesceKey: null,
});

/**
 * Registra un estado nuevo. Con la misma `coalesceKey` que el cambio anterior
 * reemplaza el presente en vez de apilar: deshacer un arrastre lo deshace
 * entero, no píxel a píxel.
 */
export const commit = <T>(
	history: History<T>,
	next: T,
	coalesceKey: string | null = null,
): History<T> => {
	if (next === history.present) return history;
	if (coalesceKey !== null && coalesceKey === history.coalesceKey) {
		return { ...history, present: next, future: [] };
	}
	return {
		past: [...history.past, history.present].slice(-HISTORY_LIMIT),
		present: next,
		future: [],
		coalesceKey,
	};
};

/** Cierra el paso en curso: el siguiente cambio se apila aunque repita clave. */
export const seal = <T>(history: History<T>): History<T> =>
	history.coalesceKey === null ? history : { ...history, coalesceKey: null };

export const undo = <T>(history: History<T>): History<T> => {
	const previous = history.past.at(-1);
	if (previous === undefined) return history;
	return {
		past: history.past.slice(0, -1),
		present: previous,
		future: [history.present, ...history.future],
		coalesceKey: null,
	};
};

export const redo = <T>(history: History<T>): History<T> => {
	const [next, ...rest] = history.future;
	if (next === undefined) return history;
	return {
		past: [...history.past, history.present],
		present: next,
		future: rest,
		coalesceKey: null,
	};
};

export const canUndo = <T>(history: History<T>) => history.past.length > 0;
export const canRedo = <T>(history: History<T>) => history.future.length > 0;
