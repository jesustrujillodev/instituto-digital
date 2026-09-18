import { describe, expect, test } from "vitest";
import type { CourseSummary } from "../../domain/course.types";
import { toCourseCards } from "../to-course-cards";

describe("toCourseCards", () => {
	const summary = {
		id: 42,
		documentId: "doc-1",
		title: "Ofimática",
		coverImageUrl: "/api/storage?key=course-covers%2Fa.webp",
	} as CourseSummary;

	test("la PK interna no viaja al cliente", () => {
		const [card] = toCourseCards([summary], () => null);

		expect(card).not.toHaveProperty("id");
		expect(Object.values(card)).not.toContain(42);
	});

	test("pinta con la URL resuelta, no con la referencia guardada", () => {
		const [card] = toCourseCards([summary], (reference) =>
			reference ? "https://cdn.ejemplo.com/a.webp" : null,
		);

		expect(card.coverUrl).toBe("https://cdn.ejemplo.com/a.webp");
		expect(card).not.toHaveProperty("coverImageUrl");
	});
});
