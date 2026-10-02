import { useEffect, useRef } from "react";
import { commandForKey, type EditorCommand } from "../utils/editor/keymap";

const isTyping = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

/**
 * Atajos del editor a nivel de ventana. Mientras el foco está en un campo, las
 * teclas son del campo (salvo guardar).
 */
export function useEditorShortcuts(
	onCommand: (command: EditorCommand) => void,
	enabled: boolean,
) {
	const handler = useRef(onCommand);
	handler.current = onCommand;

	useEffect(() => {
		if (!enabled) return;
		const listener = (event: KeyboardEvent) => {
			const command = commandForKey(event, { typing: isTyping(event.target) });
			if (!command) return;
			event.preventDefault();
			handler.current(command);
		};
		window.addEventListener("keydown", listener);
		return () => window.removeEventListener("keydown", listener);
	}, [enabled]);
}
