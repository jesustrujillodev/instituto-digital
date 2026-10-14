import { HeadObjectCommand, NotFound, S3Client } from "@aws-sdk/client-s3";
import { test as base, expect, type Page } from "@playwright/test";
import {
	SEED_PASSWORD,
	storageStatePath,
	type Topology,
	topologyOf,
} from "./topology";

const MAILPIT = "http://mailpit:8025";

export interface MailpitMessage {
	Subject: string;
	Text: string;
	HTML: string;
	To: { Address: string }[];
}

/** Espera el primer correo para `to`; cada spec usa un destinatario único. */
const waitForMail = async (to: string): Promise<MailpitMessage> => {
	const query = encodeURIComponent(`to:"${to}"`);
	let id: string | undefined;
	await expect
		.poll(
			async () => {
				const response = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
				const { messages } = (await response.json()) as {
					messages: { ID: string }[];
				};
				id = messages[0]?.ID;
				return id;
			},
			{ message: `correo para ${to}`, timeout: 30_000 },
		)
		.toBeTruthy();
	const message = await fetch(`${MAILPIT}/api/v1/message/${id}`);
	return (await message.json()) as MailpitMessage;
};

// Firma contra MinIO directo: lo que se comprueba es el bucket, no el proxy TLS.
const s3 = new S3Client({
	endpoint: "http://minio:9000",
	region: "us-east-1",
	forcePathStyle: true,
	credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
});

const objectExists = async (bucket: string, key: string) => {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return true;
	} catch (error) {
		if (error instanceof NotFound) return false;
		throw error;
	}
};

/** Entra con una cuenta en una página propia, sin tocar la del superadmin. */
const signIn = async (page: Page, email: string, password = SEED_PASSWORD) => {
	await page.goto("/iniciar-sesion");
	await page.getByLabel("Correo electrónico").fill(email);
	await page.getByLabel("Contraseña", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Entrar" }).click();
};

export const test = base.extend<{
	topology: Topology;
	adminPage: Page;
	unique: (label: string) => string;
}>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright lee las dependencias del fixture del patrón del primer argumento.
	topology: async ({}, use, testInfo) => {
		await use(topologyOf(testInfo));
	},
	adminPage: async ({ browser, topology }, use) => {
		// `browser.newContext` no hereda el `use` de la config.
		const context = await browser.newContext({
			storageState: storageStatePath(topology),
			ignoreHTTPSErrors: true,
			locale: "es-MX",
			timezoneId: "America/Tijuana",
		});
		await use(await context.newPage());
		await context.close();
	},
	// biome-ignore lint/correctness/noEmptyPattern: Playwright lee las dependencias del fixture del patrón del primer argumento.
	unique: async ({}, use, testInfo) => {
		const tag = `${Date.now().toString(36)}${testInfo.workerIndex}${testInfo.retry}`;
		let sequence = 0;
		await use((label) => `${label}-${tag}-${++sequence}`);
	},
});

export { expect, objectExists, signIn, waitForMail };
