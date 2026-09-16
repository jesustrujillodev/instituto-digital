import { describe, expect, test } from "vitest";
import { splitToastMessage } from "../use-fetcher-toast";

describe("splitToastMessage", () => {
	test("keeps a short message as the title only", () => {
		expect(splitToastMessage("Usuario archivado")).toEqual({
			title: "Usuario archivado",
		});
	});

	// La píldora de Sileo corta el título sin puntos suspensivos: un éxito parcial
	// entero en el título se leería "Cambios guardados, pero no se pudo actu".
	test("splits a partial success at the first comma", () => {
		expect(
			splitToastMessage(
				"Cambios guardados, pero no se pudo actualizar la foto.",
			),
		).toEqual({
			title: "Cambios guardados",
			description: "Pero no se pudo actualizar la foto.",
		});
	});

	test("keeps every sentence after the cut in the description", () => {
		expect(
			splitToastMessage(
				"Usuario creado, pero no se pudo guardar la foto. Puedes intentarlo desde la edición.",
			),
		).toEqual({
			title: "Usuario creado",
			description:
				"Pero no se pudo guardar la foto. Puedes intentarlo desde la edición.",
		});
	});

	test("leaves the title empty when no cut fits in the pill", () => {
		const message =
			"Probando el borrador en toda la aplicación desde ahora mismo";

		expect(splitToastMessage(message)).toEqual({
			title: "",
			description: message,
		});
	});
});
