import { describe, expect, test } from "vitest";
import {
	INTENT_FIELD,
	PHOTO_FIELD,
	parseUserFormData,
	USER_INTENTS,
} from "../parse-user-form-data";

const pngFile = (name = "foto.png", content = "binario") =>
	new File([content], name, { type: "image/png" });

describe("parseUserFormData", () => {
	test("separa la foto de los campos de texto", () => {
		const formData = new FormData();
		formData.append("email", "ana@empresa.com");
		formData.append("role", "SUPERADMIN");
		formData.append(PHOTO_FIELD, pngFile());

		const { fields, photo } = parseUserFormData(formData);

		// El File nunca debe llegar al DTO: valibot lo rechazaría.
		expect(fields).toEqual({ email: "ana@empresa.com", role: "SUPERADMIN" });
		expect(photo).toBeInstanceOf(File);
		expect(photo?.name).toBe("foto.png");
	});

	test("un archivo vacío se trata como ausencia de foto", () => {
		const formData = new FormData();
		formData.append("email", "ana@empresa.com");
		// El navegador manda un File de 0 bytes cuando el input no tiene selección.
		formData.append(
			PHOTO_FIELD,
			new File([], "", { type: "application/octet-stream" }),
		);

		expect(parseUserFormData(formData).photo).toBeNull();
	});

	test("extrae el intent y lo mantiene fuera de los campos", () => {
		const formData = new FormData();
		formData.append(INTENT_FIELD, USER_INTENTS.resetPassword);
		formData.append("newPassword", "Password123!");

		const { fields, intent } = parseUserFormData(formData);

		expect(intent).toBe(USER_INTENTS.resetPassword);
		expect(fields).toEqual({ newPassword: "Password123!" });
	});

	test("descarta los campos vacíos", () => {
		const formData = new FormData();
		formData.append("email", "ana@empresa.com");
		formData.append("phone", "");
		formData.append("lastName", "");

		// "" no es un valor válido para los campos opcionales del dominio, es su
		// ausencia: enviarlo haría fallar la validación de formato.
		expect(parseUserFormData(formData).fields).toEqual({
			email: "ana@empresa.com",
		});
	});

	test("sin foto ni intent devuelve null en ambos", () => {
		const formData = new FormData();
		formData.append("email", "ana@empresa.com");

		const { photo, intent } = parseUserFormData(formData);

		expect(photo).toBeNull();
		expect(intent).toBeNull();
	});
});

describe("parseUserFormData — guarda de ejecución", () => {
	// Pese al tipo que declara bun-types para `entries()`, un envío multipart
	// puede traer un File en CUALQUIER clave. Sin la guarda, ese File acabaría en
	// `fields` y valibot lo rechazaría con un error de validación confuso.
	test("descarta un archivo que llega bajo una clave que no es la foto", () => {
		const formData = new FormData();
		formData.append("firstName", "Ana");
		formData.append("adjunto", new File(["x"], "otro.pdf"));

		const { fields, photo } = parseUserFormData(formData);

		expect(fields).toEqual({ firstName: "Ana" });
		expect(photo).toBeNull();
	});
});
