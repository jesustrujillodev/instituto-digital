import { describe, expect, test } from "vitest";
import { shouldRevalidateLesson } from "../classroom-revalidation";

const formOf = (status: string) => {
	const formData = new FormData();
	formData.set("status", status);
	return formData;
};

describe("shouldRevalidateLesson", () => {
	test("abrir la lección no la vuelve a cargar", () => {
		expect(
			shouldRevalidateLesson({
				formData: formOf("IN_PROGRESS"),
				actionResult: { success: true },
				defaultShouldRevalidate: true,
			}),
		).toBe(false);
	});

	test("completarla sí, para enseñar que quedó completada", () => {
		expect(
			shouldRevalidateLesson({
				formData: formOf("COMPLETED"),
				actionResult: { success: true },
				defaultShouldRevalidate: true,
			}),
		).toBe(true);
	});

	test("un fallo al abrirla recarga el estado real", () => {
		expect(
			shouldRevalidateLesson({
				formData: formOf("IN_PROGRESS"),
				actionResult: { success: false },
				defaultShouldRevalidate: true,
			}),
		).toBe(true);
	});

	test("una navegación conserva la decisión de React Router", () => {
		expect(shouldRevalidateLesson({ defaultShouldRevalidate: false })).toBe(
			false,
		);
	});
});
