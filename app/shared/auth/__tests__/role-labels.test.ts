import { describe, expect, test } from "vitest";
import { accountLabelOf } from "../role-labels";

describe("accountLabelOf", () => {
	test("una cuenta USER sin dependencia es el capacitador externo", () => {
		expect(accountLabelOf({ role: "USER", hasDependency: false })).toBe(
			"Capacitador externo",
		);
	});

	test("con dependencia, o con otro rol, se nombra por su rol", () => {
		expect(accountLabelOf({ role: "USER", hasDependency: true })).toBe(
			"Participante",
		);
		expect(accountLabelOf({ role: "SUPERADMIN", hasDependency: false })).toBe(
			"Superadministrador",
		);
	});
});
