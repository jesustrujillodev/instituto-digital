import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Cursos del seed (prisma/seed-courses.ts) que las specs usan. */
export const SEED_COURSES = {
	scheduledPublished: "Atención ciudadana con enfoque de derechos",
	selfPaced: "Marco normativo municipal en línea",
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

export interface Envelope<T> {
	success: boolean;
	data: T;
	error?: { code: string; message: string };
}

/** POST a una ruta de recurso con el `intent` y el `payload` de sus formularios. */
export const postIntent = async <T>(
	request: APIRequestContext,
	path: string,
	intent: string,
	payload: unknown,
): Promise<Envelope<T>> => {
	const response = await request.post(path, {
		form: { intent, payload: JSON.stringify(payload) },
	});
	expect(response.ok(), `${intent} → ${response.status()}`).toBe(true);
	return (await response.json()) as Envelope<T>;
};
