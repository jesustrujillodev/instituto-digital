import { expect, type Page } from "@playwright/test";

/** Contraseña de las cuentas que crean las specs. */
export const E2E_PASSWORD = "E2e-Clave-2026!";

/**
 * Da de alta una cuenta de participante desde /dashboard/usuarios/nuevo, como
 * lo haría el superadministrador. La primera dependencia del listado basta.
 */
export const createUser = async (adminPage: Page, email: string) => {
	await adminPage.goto("/dashboard/usuarios/nuevo");
	await adminPage.getByLabel("Nombre", { exact: true }).fill("Prueba");
	await adminPage.getByLabel("Apellido", { exact: true }).fill("E2E");
	await adminPage.getByLabel("Correo electrónico").fill(email);
	await adminPage
		.getByLabel("Número de empleado")
		.fill(email.replace(/@.*/, "").slice(-20));
	await adminPage.getByRole("combobox", { name: "Dependencia" }).click();
	await adminPage.getByRole("option").first().click();
	// El campo obligatorio se anuncia como «Contraseña *».
	await adminPage
		.getByRole("textbox", { name: /^Contraseña/ })
		.fill(E2E_PASSWORD);
	await adminPage
		.getByRole("button", { name: "Crear usuario" })
		.first()
		.click();

	await expect(adminPage).toHaveURL(/\/dashboard\/usuarios(?!\/nuevo)/);
};
