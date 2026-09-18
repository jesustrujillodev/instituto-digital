import { describe, expect, test } from "vitest";
import {
	DEFAULT_VIEW_MODE,
	readViewMode,
	serializeViewMode,
	VIEW_MODE_SCREENS,
} from "../view-mode";

describe("readViewMode", () => {
	test("sin cookie usa la cuadrícula", () => {
		expect(readViewMode(null, VIEW_MODE_SCREENS.courses)).toBe(
			DEFAULT_VIEW_MODE,
		);
	});

	test("lee la disposición de su pantalla y no la de otra", () => {
		const header = "vista_cursos=list; vista_mis_cursos=grid";

		expect(readViewMode(header, VIEW_MODE_SCREENS.courses)).toBe("list");
		expect(readViewMode(header, VIEW_MODE_SCREENS.mine)).toBe("grid");
		expect(readViewMode(header, VIEW_MODE_SCREENS.teaching)).toBe("grid");
	});

	test("un valor fuera de la allowlist cae al default", () => {
		expect(
			readViewMode("vista_imparticion=tabla", VIEW_MODE_SCREENS.teaching),
		).toBe(DEFAULT_VIEW_MODE);
	});

	test("lo que escribe el navegador se vuelve a leer igual", () => {
		const [pair] = serializeViewMode(VIEW_MODE_SCREENS.available, "list").split(
			";",
		);

		expect(readViewMode(pair, VIEW_MODE_SCREENS.available)).toBe("list");
	});
});
