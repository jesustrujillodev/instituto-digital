import { expect, signIn, test } from "../support/fixtures";
import { SUPERADMIN_EMAIL } from "../support/topology";
import { createUser, E2E_PASSWORD } from "../support/users";

test("credenciales incorrectas no abren sesión y no dicen cuál falló", async ({
	page,
	unique,
}) => {
	await signIn(page, `${unique("nadie")}@idc.test`, "NoEsLaClave1!");

	await expect(page.getByRole("alert")).toHaveText("Credenciales inválidas.");
	await expect(page).toHaveURL(/\/iniciar-sesion/);
});

test("el login deja cookies de sesión seguras y el logout las retira", async ({
	page,
	context,
}) => {
	await signIn(page, SUPERADMIN_EMAIL);
	await expect(page).toHaveURL(/\/dashboard/);

	const cookies = await context.cookies();
	for (const name of ["__Host-access_token", "__Host-refresh_token"]) {
		expect(
			cookies.find((cookie) => cookie.name === name),
			name,
		).toMatchObject({
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
			path: "/",
		});
	}

	await page.request.post("/cerrar-sesion");
	await page.goto("/dashboard");

	await expect(page).toHaveURL(/\/iniciar-sesion/);
});

test("tras varios intentos fallidos el mismo correo queda bloqueado un rato", async ({
	page,
	unique,
}) => {
	const email = `${unique("bloqueo")}@idc.test`;
	// AUTH_LOGIN_MAX_PER_EMAIL por defecto: 5 por ventana.
	for (let attempt = 0; attempt < 5; attempt++) {
		await signIn(page, email, "NoEsLaClave1!");
		await expect(page.getByRole("alert")).toHaveText("Credenciales inválidas.");
	}

	await signIn(page, email, "NoEsLaClave1!");

	await expect(page.getByRole("alert")).toHaveText(
		/Demasiados intentos\. Intenta de nuevo en \d+ segundos\./,
	);
});

/**
 * El epoch por usuario: la revocación corta tokens que todavía no expiran. En
 * queued el aviso cruza procesos por Redis; en inline lo invalida el mismo
 * proceso. Debe llegar antes del TTL del access token (5 min).
 */
test("revocar las sesiones de un usuario lo saca de la plataforma", async ({
	adminPage,
	browser,
	unique,
}) => {
	const email = `${unique("revocada")}@idc.test`;
	await createUser(adminPage, email);
	const context = await browser.newContext({ ignoreHTTPSErrors: true });
	const userPage = await context.newPage();
	await signIn(userPage, email, E2E_PASSWORD);
	await expect(userPage).toHaveURL(/\/dashboard/);

	await adminPage.goto("/dashboard/sesiones");
	await adminPage.getByPlaceholder("Buscar por nombre o correo").fill(email);
	const row = adminPage.getByRole("row").filter({ hasText: email });
	// La búsqueda re-renderiza la tabla: un menú abierto antes se cerraría.
	await expect(adminPage.getByRole("row")).toHaveCount(2);
	await row.getByRole("button").last().click();
	await adminPage
		.getByRole("menuitem", { name: "Revocar las del usuario" })
		.click();
	await adminPage
		.getByRole("alertdialog")
		.getByRole("button", { name: /Revocar/ })
		.click();
	await expect(row).toHaveCount(0);

	await expect
		.poll(
			async () => {
				await userPage.goto("/dashboard");
				return new URL(userPage.url()).pathname;
			},
			{ timeout: 30_000, intervals: [1_000] },
		)
		.toBe("/iniciar-sesion");
	await context.close();
});
