import { describe, expect, test } from "vitest";
import { canBeHead } from "../dependency.access";

describe("canBeHead", () => {
	// Designarlo titular le quitaría el rol, y podría ser el último que queda.
	test("un superadministrador no puede ser titular", () => {
		expect(canBeHead("SUPERADMIN")).toBe(false);
	});

	test("el personal de la dependencia sí", () => {
		expect(canBeHead("USER")).toBe(true);
		expect(canBeHead("DEPENDENCY_DEPUTY")).toBe(true);
		expect(canBeHead("DEPENDENCY_HEAD")).toBe(true);
	});
});
