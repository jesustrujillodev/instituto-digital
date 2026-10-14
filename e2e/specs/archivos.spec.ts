import {
	courseDocumentId,
	type Envelope,
	postIntent,
	SEED_COURSES,
} from "../support/courses";
import { expect, objectExists, test } from "../support/fixtures";

interface Board {
	sessions: {
		documentId: string;
		materials: { documentId: string; title: string; fileUrl: string | null }[];
	}[];
}

/**
 * La subida directa al bucket del material de una sesión, como la hace
 * `use-session-materials`: la app firma, el navegador escribe en el bucket
 * (CORS y TLS reales), la app verifica el objeto, lo sirve por el proxy y al
 * quitarlo lo borra con el trabajo `delete-object` (worker o en proceso).
 */
test("material de sesión: subida firmada, lectura por el proxy y borrado", async ({
	adminPage,
	topology,
	unique,
}) => {
	const course = await courseDocumentId(
		adminPage,
		SEED_COURSES.scheduledPublished,
	);
	const path = `/dashboard/capacitaciones/${course}/sesiones/material`;
	const board = (await (
		await adminPage.request.get(path)
	).json()) as Envelope<Board>;
	expect(board.success).toBe(true);
	const session = board.data.sessions[0];

	const content = `material ${unique("e2e")}`;
	const fileName = `${unique("acta")}.pdf`;
	const ticket = await postIntent<{ key: string; uploadUrl: string }>(
		adminPage.request,
		path,
		"upload-url",
		{
			sessionDocumentId: session.documentId,
			kind: "FILE",
			fileName,
			contentType: "application/pdf",
			size: content.length,
		},
	);
	expect(ticket.success, ticket.error?.message).toBe(true);
	const { key, uploadUrl } = ticket.data;

	const uploadStatus = await adminPage.evaluate(
		async ({ url, body }) =>
			(
				await fetch(url, {
					method: "PUT",
					headers: { "Content-Type": "application/pdf" },
					body,
				})
			).status,
		{ url: uploadUrl, body: content },
	);
	expect(uploadStatus).toBe(200);
	expect(await objectExists(topology.bucket, key)).toBe(true);

	const title = unique("Material");
	const created = await postIntent(
		adminPage.request,
		path,
		"create-session-material",
		{
			type: "FILE",
			sessionDocumentId: session.documentId,
			title,
			availableFromSession: true,
			key,
			fileName,
		},
	);
	expect(created.success, created.error?.message).toBe(true);

	const after = (await (
		await adminPage.request.get(path)
	).json()) as Envelope<Board>;
	const material = after.data.sessions
		.flatMap((candidate) => candidate.materials)
		.find((candidate) => candidate.title === title);
	expect(material?.fileUrl).toBeTruthy();

	const served = await adminPage.request.get(material?.fileUrl as string);
	expect(served.status()).toBe(200);
	expect(await served.text()).toBe(content);

	const removed = await postIntent(
		adminPage.request,
		path,
		"remove-session-material",
		{
			materialDocumentId: material?.documentId,
		},
	);
	expect(removed.success, removed.error?.message).toBe(true);

	await expect
		.poll(() => objectExists(topology.bucket, key), { timeout: 30_000 })
		.toBe(false);
});
