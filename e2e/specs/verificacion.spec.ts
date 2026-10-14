import { expect, test } from "../support/fixtures";

// La verificación es pública a propósito (docs/adr/0020): quien tiene el papel
// no tiene cuenta.
test("la verificación de un certificado se consulta sin sesión", async ({
	page,
}) => {
	await page.goto("/verificar/00000000-0000-4000-8000-000000000000");

	await expect(page).toHaveURL(/\/verificar\//);
	await expect(page.getByRole("heading").first()).toBeVisible();
});
