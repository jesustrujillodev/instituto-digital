import { courseDocumentId, SEED_COURSES } from "../support/courses";
import { expect, test } from "../support/fixtures";

const PDF_MAGIC = "%PDF-";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Exportar la muestra del certificado abre el Chromium de la imagen (Alpine,
 * sin sandbox) y, para el PDF, pasa por el worker de `build/worker/`. Es lo que
 * más depende del contenedor y lo que ninguna prueba unitaria toca.
 */
test("la muestra del certificado se exporta en PDF y PNG con el Chromium de la imagen", async ({
	adminPage,
}) => {
	test.setTimeout(120_000);
	const course = await courseDocumentId(
		adminPage,
		SEED_COURSES.scheduledPublished,
	);
	await adminPage.goto(`/dashboard/capacitaciones/${course}/certificado`);
	const publish = adminPage.getByRole("button", {
		name: "Publicar lo guardado",
	});
	if (await publish.isVisible()) {
		await publish.click();
		await expect(publish).toBeHidden();
	}

	const sample = (format: "pdf" | "png") =>
		adminPage.request.get(
			`/dashboard/capacitaciones/${course}/certificado/muestra?version=published&formato=${format}`,
			{ timeout: 90_000 },
		);

	const pdf = await sample("pdf");
	expect(pdf.status(), await pdf.text().catch(() => "")).toBe(200);
	expect(pdf.headers()["content-type"]).toContain("application/pdf");
	expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe(PDF_MAGIC);

	const png = await sample("png");
	expect(png.status()).toBe(200);
	expect(png.headers()["content-type"]).toContain("image/png");
	expect([...(await png.body()).subarray(0, 8)]).toEqual(PNG_MAGIC);
});
