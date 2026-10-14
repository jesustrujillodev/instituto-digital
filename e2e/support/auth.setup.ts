import { expect, test as setup } from "@playwright/test";
import {
	SEED_PASSWORD,
	SUPERADMIN_EMAIL,
	storageStatePath,
	topologyOf,
} from "./topology";

/**
 * Una sesión de superadministrador por forma de despliegue, guardada para todas
 * las specs: entrar una sola vez no gasta el límite de intentos por correo.
 */
setup("sesión de superadministrador", async ({ page }, testInfo) => {
	await page.goto("/iniciar-sesion");
	await page.getByLabel("Correo electrónico").fill(SUPERADMIN_EMAIL);
	await page.getByLabel("Contraseña", { exact: true }).fill(SEED_PASSWORD);
	await page.getByRole("button", { name: "Entrar" }).click();

	await expect(page).toHaveURL(/\/dashboard/);
	await page
		.context()
		.storageState({ path: storageStatePath(topologyOf(testInfo)) });
});
