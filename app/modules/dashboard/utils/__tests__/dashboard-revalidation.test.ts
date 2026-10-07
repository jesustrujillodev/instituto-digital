import { describe, expect, test } from "vitest";
import { THEME_PREFERENCE_PATH } from "@/modules/theme/domain/theme.config";
import { shouldRevalidateDashboard } from "../dashboard-revalidation";

describe("shouldRevalidateDashboard", () => {
	test("cambiar el modo claro u oscuro no vuelve a leer el panel", () => {
		expect(
			shouldRevalidateDashboard({
				formAction: THEME_PREFERENCE_PATH,
				defaultShouldRevalidate: true,
			}),
		).toBe(false);
	});

	test("cualquier otro envío sigue la regla por defecto", () => {
		expect(
			shouldRevalidateDashboard({
				formAction: "/dashboard/mis-capacitaciones/c-1",
				defaultShouldRevalidate: true,
			}),
		).toBe(true);
		expect(shouldRevalidateDashboard({ defaultShouldRevalidate: false })).toBe(
			false,
		);
	});
});
