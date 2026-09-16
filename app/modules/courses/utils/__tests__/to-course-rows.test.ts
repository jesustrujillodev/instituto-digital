import { describe, expect, test } from "vitest";
import type { CourseSummary } from "../../domain/course.types";
import { toCourseRows } from "../to-course-rows";

describe("toCourseRows", () => {
	// La PK interna no viaja a la tabla: el id de la fila es el público.
	test("sustituye el id interno por el documentId", () => {
		const [row] = toCourseRows([
			{ id: 42, documentId: "doc-1", title: "Ofimática" } as CourseSummary,
		]);

		expect(row.id).toBe("doc-1");
		expect(Object.values(row)).not.toContain(42);
	});
});
