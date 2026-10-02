import { designsEqual } from "../../domain/certificate.rules";
import type { CertificateDesignV2 } from "../../domain/design/design-v2.schema";
import {
	commit,
	createHistory,
	type History,
	redo,
	seal,
	undo,
} from "./history";

export interface EditorState {
	history: History<CertificateDesignV2>;
	selection: string[];
	/** Lo último guardado: contra esto se decide si hay cambios. */
	baseline: CertificateDesignV2;
}

export type EditorAction =
	| {
			type: "commit";
			design: CertificateDesignV2;
			/** Misma clave seguida = un solo paso al deshacer (un arrastre). */
			coalesceKey?: string;
			select?: string[];
	  }
	| { type: "seal" }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "select"; ids: string[] }
	| { type: "saved"; design: CertificateDesignV2 }
	| { type: "reset"; design: CertificateDesignV2 };

export const createEditorState = (
	design: CertificateDesignV2,
	baseline: CertificateDesignV2 = design,
): EditorState => ({
	history: createHistory(design),
	selection: [],
	baseline,
});

/** La selección sin ids que ya no existen (tras deshacer o borrar). */
const existing = (design: CertificateDesignV2, ids: readonly string[]) => {
	const known = new Set(design.elements.map((element) => element.id));
	return ids.filter((id) => known.has(id));
};

export const editorReducer = (
	state: EditorState,
	action: EditorAction,
): EditorState => {
	switch (action.type) {
		case "commit": {
			const history = commit(state.history, action.design, action.coalesceKey);
			return {
				...state,
				history,
				selection: existing(history.present, action.select ?? state.selection),
			};
		}
		case "seal":
			return { ...state, history: seal(state.history) };
		case "undo":
		case "redo": {
			const history = (action.type === "undo" ? undo : redo)(state.history);
			return {
				...state,
				history,
				selection: existing(history.present, state.selection),
			};
		}
		case "select":
			return {
				...state,
				selection: existing(state.history.present, action.ids),
			};
		case "saved":
			return { ...state, baseline: action.design };
		case "reset":
			return createEditorState(action.design);
	}
};

export const isEditorDirty = (state: EditorState): boolean =>
	!designsEqual(state.history.present, state.baseline);
