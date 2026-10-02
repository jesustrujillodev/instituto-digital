import { describe, expect, test } from "vitest";
import { commandForKey, type KeyInput } from "../keymap";

const key = (value: string, mods: Partial<KeyInput> = {}): KeyInput => ({
	key: value,
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	...mods,
});

const run = (input: KeyInput, typing = false) =>
	commandForKey(input, { typing });

describe("atajos del editor", () => {
	test.each([
		[key("z", { ctrlKey: true }), { type: "undo" }],
		[key("Z", { ctrlKey: true, shiftKey: true }), { type: "redo" }],
		[key("y", { metaKey: true }), { type: "redo" }],
		[key("d", { ctrlKey: true }), { type: "duplicate" }],
		[key("c", { ctrlKey: true }), { type: "copy" }],
		[key("v", { ctrlKey: true }), { type: "paste" }],
		[key("a", { ctrlKey: true }), { type: "select-all" }],
		[key("s", { ctrlKey: true }), { type: "save" }],
		[key("]", { ctrlKey: true }), { type: "reorder", direction: "forward" }],
		[
			key("]", { ctrlKey: true, shiftKey: true }),
			{ type: "reorder", direction: "front" },
		],
		[key("[", { ctrlKey: true }), { type: "reorder", direction: "backward" }],
		[
			key("[", { ctrlKey: true, shiftKey: true }),
			{ type: "reorder", direction: "back" },
		],
		[key("Delete"), { type: "delete" }],
		[key("Backspace"), { type: "delete" }],
		[key("Escape"), { type: "deselect" }],
		[key("ArrowLeft"), { type: "nudge", dx: -1, dy: 0 }],
		[key("ArrowDown", { shiftKey: true }), { type: "nudge", dx: 0, dy: 10 }],
	])("%o", (input, command) => {
		expect(run(input)).toEqual(command);
	});

	test("lo que no es atajo no hace nada", () => {
		expect(run(key("x"))).toBeNull();
		expect(run(key("x", { ctrlKey: true }))).toBeNull();
	});

	test("escribiendo en un campo solo responde guardar", () => {
		expect(run(key("Delete"), true)).toBeNull();
		expect(run(key("z", { ctrlKey: true }), true)).toBeNull();
		expect(run(key("s", { ctrlKey: true }), true)).toEqual({ type: "save" });
	});
});
