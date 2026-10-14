import { expect, test } from "../support/fixtures";

test("la portada y el login responden desde la imagen de producción", async ({
	page,
}) => {
	const home = await page.goto("/");
	expect(home?.status()).toBe(200);

	const login = await page.goto("/iniciar-sesion");
	expect(login?.status()).toBe(200);
	await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("los assets del build se sirven con caché inmutable", async ({ page }) => {
	const assets: { url: string; cacheControl: string | undefined }[] = [];
	page.on("response", (response) => {
		if (new URL(response.url()).pathname.startsWith("/assets/")) {
			assets.push({
				url: response.url(),
				cacheControl: response.headers()["cache-control"],
			});
		}
	});

	await page.goto("/iniciar-sesion");
	await page.waitForLoadState("networkidle");

	expect(assets.length).toBeGreaterThan(0);
	for (const asset of assets) {
		expect(asset.cacheControl, asset.url).toContain("immutable");
	}
});

test("sin sesión, el dashboard manda al login", async ({ page }) => {
	await page.goto("/dashboard");

	await expect(page).toHaveURL(/\/iniciar-sesion/);
});
