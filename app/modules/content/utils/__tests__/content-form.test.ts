import { describe, expect, it } from "vitest";
import {
	CONTENT_INTENTS,
	INTENT_FIELD,
	shouldRevalidateAfterArchive,
} from "../content-form";

const formWith = (intent: string) => {
	const formData = new FormData();
	formData.set(INTENT_FIELD, intent);
	return formData;
};

describe("shouldRevalidateAfterArchive", () => {
	it("no vuelve a pedir el material tras archivar una lección", () => {
		expect(
			shouldRevalidateAfterArchive({
				formData: formWith(CONTENT_INTENTS.archiveLesson),
				defaultShouldRevalidate: true,
			}),
		).toBe(false);
	});

	it("revalida tras cualquier otra acción", () => {
		expect(
			shouldRevalidateAfterArchive({
				formData: formWith(CONTENT_INTENTS.saveMaterial),
				defaultShouldRevalidate: true,
			}),
		).toBe(true);
	});

	it("respeta el valor por omisión fuera de un envío", () => {
		expect(
			shouldRevalidateAfterArchive({ defaultShouldRevalidate: false }),
		).toBe(false);
	});
});
