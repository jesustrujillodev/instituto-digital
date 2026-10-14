import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Cursos del seed (prisma/seed-courses.ts) que las specs usan. */
export const SEED_COURSES = {
	scheduledPublished: "Atención ciudadana con enfoque de derechos",
} as const;

/** El `documentId` de un curso del seed, tomado del enlace en el listado. */
export const courseDocumentId = async (page: Page, title: string) => {
	await page.goto("/dashboard/capacitaciones");
	// El listado pagina: se busca por título para no depender del orden.
	await page
		.getByRole("textbox", { name: "Buscar capacitaciones" })
		.fill(title);
	const link = page.getByRole("link", { name: title }).first();
	await expect(link).toBeVisible();
	const href = (await link.getAttribute("href")) ?? "";
	const match = href.match(/[0-9a-f-]{36}/);
	if (!match)
		throw new Error(`Sin documentId en el enlace de «${title}»: ${href}`);
	return match[0];
};
