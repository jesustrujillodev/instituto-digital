import { describe, expect, test } from "vitest";
import { TRAINER_LIST_DEFAULTS } from "../trainer.config";

describe("TRAINER_LIST_DEFAULTS", () => {
	test("es la fuente única de la paginación del catálogo", () => {
		expect(TRAINER_LIST_DEFAULTS).toEqual({ page: 1, pageSize: 10 });
	});
});
