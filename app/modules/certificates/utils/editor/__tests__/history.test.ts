import { describe, expect, test } from "vitest";
import {
	canRedo,
	canUndo,
	commit,
	createHistory,
	HISTORY_LIMIT,
	redo,
	seal,
	undo,
} from "../history";

describe("historial", () => {
	test("deshacer y rehacer recorren los estados", () => {
		let history = createHistory("a");
		history = commit(history, "b");
		history = commit(history, "c");

		expect(canUndo(history)).toBe(true);
		history = undo(history);
		expect(history.present).toBe("b");
		expect(canRedo(history)).toBe(true);
		history = redo(history);
		expect(history.present).toBe("c");
	});

	test("sin pasos, deshacer y rehacer no hacen nada", () => {
		const history = createHistory("a");
		expect(undo(history)).toBe(history);
		expect(redo(history)).toBe(history);
		expect(canUndo(history)).toBe(false);
		expect(canRedo(history)).toBe(false);
	});

	test("el mismo estado no apila", () => {
		const history = createHistory("a");
		expect(commit(history, "a")).toBe(history);
	});

	test("un gesto con la misma clave es un solo paso", () => {
		let history = createHistory("a");
		history = commit(history, "b", "drag");
		history = commit(history, "c", "drag");
		history = commit(history, "d", "drag");

		expect(history.past).toEqual(["a"]);
		expect(undo(history).present).toBe("a");
	});

	test("sellar cierra el gesto aunque la clave se repita", () => {
		let history = createHistory("a");
		history = commit(history, "b", "drag");
		history = seal(history);
		history = commit(history, "c", "drag");

		expect(history.past).toEqual(["a", "b"]);
		expect(seal(createHistory("x")).coalesceKey).toBeNull();
	});

	test("un cambio nuevo borra lo rehacible", () => {
		let history = commit(commit(createHistory("a"), "b"), "c");
		history = commit(undo(history), "x");
		expect(history.future).toEqual([]);
	});

	test("guarda como mucho el tope de pasos", () => {
		let history = createHistory(0);
		for (let step = 1; step <= HISTORY_LIMIT + 10; step++) {
			history = commit(history, step);
		}
		expect(history.past).toHaveLength(HISTORY_LIMIT);
	});
});
