import { describe, expect, test } from "vitest";
import { PRESETS } from "../../../domain/design/design.presets";
import { removeElements, updateElement } from "../commands";
import {
	createEditorState,
	editorReducer,
	isEditorDirty,
} from "../editor-state";

const design = PRESETS.institucional;

describe("estado del editor", () => {
	test("un cambio ensucia y guardar lo limpia", () => {
		const changed = updateElement(design, "franja", { opacity: 0.5 });
		let state = editorReducer(createEditorState(design), {
			type: "commit",
			design: changed,
		});
		expect(isEditorDirty(state)).toBe(true);

		state = editorReducer(state, { type: "saved", design: changed });
		expect(isEditorDirty(state)).toBe(false);
	});

	test("deshacer hasta lo guardado deja de estar sucio", () => {
		const changed = updateElement(design, "franja", { opacity: 0.5 });
		let state = editorReducer(createEditorState(design), {
			type: "commit",
			design: changed,
		});
		state = editorReducer(state, { type: "undo" });
		expect(isEditorDirty(state)).toBe(false);
		state = editorReducer(state, { type: "redo" });
		expect(state.history.present).toBe(changed);
	});

	test("la selección solo conserva ids que existen", () => {
		let state = editorReducer(createEditorState(design), {
			type: "select",
			ids: ["franja", "nadie"],
		});
		expect(state.selection).toEqual(["franja"]);

		state = editorReducer(state, {
			type: "commit",
			design: removeElements(design, ["franja"]),
		});
		expect(state.selection).toEqual([]);

		state = editorReducer(state, { type: "undo" });
		expect(state.history.present).toBe(design);
	});

	test("un commit puede fijar la selección", () => {
		const state = editorReducer(createEditorState(design), {
			type: "commit",
			design: updateElement(design, "logo", { x: 1 }),
			select: ["logo"],
		});
		expect(state.selection).toEqual(["logo"]);
	});

	test("sellar cierra el gesto; reiniciar parte de cero", () => {
		let state = editorReducer(createEditorState(design), {
			type: "commit",
			design: updateElement(design, "logo", { x: 1 }),
			coalesceKey: "drag",
		});
		state = editorReducer(state, { type: "seal" });
		expect(state.history.coalesceKey).toBeNull();

		state = editorReducer(state, { type: "reset", design: PRESETS.marco });
		expect(state.history.past).toEqual([]);
		expect(state.baseline).toBe(PRESETS.marco);
	});
});
