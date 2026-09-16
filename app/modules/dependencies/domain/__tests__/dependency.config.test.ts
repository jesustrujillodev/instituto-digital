import { describe, expect, test } from "vitest";
import { DEPENDENCY_LIST_DEFAULTS } from "../dependency.config";

describe("DEPENDENCY_LIST_DEFAULTS", () => {
	// Fuente ÚNICA: los comparten el loader, el servicio y el repositorio. Dos
	// valores distintos producirían una `pagination` que no describe la página que
	// realmente se consultó.
	test("es la primera página de diez", () => {
		expect(DEPENDENCY_LIST_DEFAULTS).toEqual({ page: 1, pageSize: 10 });
	});
});
