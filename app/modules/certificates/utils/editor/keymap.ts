import type { Reorder } from "./commands";

export type EditorCommand =
	| { type: "undo" }
	| { type: "redo" }
	| { type: "delete" }
	| { type: "duplicate" }
	| { type: "copy" }
	| { type: "paste" }
	| { type: "select-all" }
	| { type: "deselect" }
	| { type: "save" }
	| { type: "nudge"; dx: number; dy: number }
	| { type: "reorder"; direction: Reorder };

export interface KeyInput {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}

/** Lo que mueve una flecha, en puntos; con Shift, diez veces más. */
export const NUDGE_PT = 1;
export const NUDGE_LARGE_PT = 10;

const ARROWS: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

/**
 * El comando de una tecla, o null. Con el foco en un campo de texto solo
 * guardar responde: el resto de las teclas son del campo.
 */
export const commandForKey = (
	input: KeyInput,
	{ typing }: { typing: boolean },
): EditorCommand | null => {
	const mod = input.ctrlKey || input.metaKey;
	const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;

	if (mod && key === "s") return { type: "save" };
	if (typing) return null;

	if (mod) {
		if (key === "z")
			return input.shiftKey ? { type: "redo" } : { type: "undo" };
		if (key === "y") return { type: "redo" };
		if (key === "d") return { type: "duplicate" };
		if (key === "c") return { type: "copy" };
		if (key === "v") return { type: "paste" };
		if (key === "a") return { type: "select-all" };
		if (key === "]")
			return {
				type: "reorder",
				direction: input.shiftKey ? "front" : "forward",
			};
		if (key === "[")
			return {
				type: "reorder",
				direction: input.shiftKey ? "back" : "backward",
			};
		return null;
	}

	if (key === "Delete" || key === "Backspace") return { type: "delete" };
	if (key === "Escape") return { type: "deselect" };

	const arrow = ARROWS[key];
	if (arrow) {
		const step = input.shiftKey ? NUDGE_LARGE_PT : NUDGE_PT;
		return { type: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
	}
	return null;
};
