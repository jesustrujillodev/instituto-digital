import { describe, expect, test } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
	test("joins plain class names", () => {
		expect(cn("px-2", "py-1")).toBe("px-2 py-1");
	});

	// La razón de que exista el wrapper: sin twMerge, la clase de un componente y
	// la que llega por prop conviven y gana la del CSS, no la del llamador.
	test("the last conflicting utility wins", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
		expect(cn("text-sm text-red-500", "text-lg")).toBe("text-red-500 text-lg");
	});

	test("drops falsy values from conditionals", () => {
		expect(cn("base", false && "hidden", null, undefined, "")).toBe("base");
	});

	test("supports the object and array forms of clsx", () => {
		expect(cn(["px-2", { "py-1": true, "py-4": false }])).toBe("px-2 py-1");
	});

	test("no arguments produces an empty string", () => {
		expect(cn()).toBe("");
	});
});
