import { describe, expect, it } from "vitest";
import {
	CONTENT_INTENTS,
	INTENT_FIELD,
	shouldRevalidateAfterDelete,
} from "../content-form";

const formWith = (intent: string) => {
	const formData = new FormData();
	formData.set(INTENT_FIELD, intent);
	return formData;
};

describe("shouldRevalidateAfterDelete", () => {
	it("no vuelve a pedir el material tras borrar una lección", () => {
		expect(
			shouldRevalidateAfterDelete({
				formData: formWith(CONTENT_INTENTS.deleteLesson),
				defaultShouldRevalidate: true,
			}),
		).toBe(false);
	});

	it("revalida tras cualquier otra acción", () => {
		expect(
			shouldRevalidateAfterDelete({
				formData: formWith(CONTENT_INTENTS.saveMaterial),
				defaultShouldRevalidate: true,
			}),
		).toBe(true);
	});

	it("respeta el valor por omisión fuera de un envío", () => {
		expect(
			shouldRevalidateAfterDelete({ defaultShouldRevalidate: false }),
		).toBe(false);
	});
});
