import { expect, test, waitForMail } from "../support/fixtures";
import { createUser } from "../support/users";

/**
 * El alta escribe el aviso en el outbox dentro de su transacción. Lo entrega el
 * worker de BullMQ (queued) o el poller del proceso web (inline): en los dos
 * casos tiene que llegar al SMTP con el enlace del dominio público.
 */
test("el alta de una cuenta envía su aviso por SMTP", async ({
	adminPage,
	topology,
	unique,
}) => {
	const email = `${unique("alta")}@idc.test`;

	await createUser(adminPage, email);

	const mail = await waitForMail(email);
	expect(mail.Subject).toMatch(/^Tu cuenta en /);
	expect(mail.Text).toContain(`${topology.baseURL}/iniciar-sesion`);
	expect(mail.HTML).toContain(`href="${topology.baseURL}/iniciar-sesion"`);
});
