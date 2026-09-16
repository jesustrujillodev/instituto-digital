import { describe, expect, test } from "vitest";
import { isPublicKey } from "@/shared/storage/storage.policy";
import {
	USER_LIST_DEFAULTS,
	USER_PHOTO,
	USER_PHOTO_HINT,
} from "../user.config";

describe("USER_PHOTO", () => {
	test("declara los tipos permitidos y el tope de tamaño", () => {
		expect(USER_PHOTO.allowedTypes).toEqual([
			"image/png",
			"image/jpeg",
			"image/webp",
		]);
		expect(USER_PHOTO.maxBytes).toBe(5 * 1024 * 1024);
	});

	// El prefijo tiene que estar declarado PÚBLICO en la política de storage, o el
	// proxy exigiría sesión para pintar el avatar de cualquier pantalla.
	test("su prefijo corresponde a un prefijo público de storage", () => {
		expect(isPublicKey(`${USER_PHOTO.prefix}/ana-1700000000.webp`)).toBe(true);
	});
});

describe("USER_PHOTO_HINT", () => {
	// Se DERIVA de maxBytes en vez de escribirse a mano: si alguien sube el límite
	// a 10 MB, el texto de ayuda acompaña solo. Un hint desincronizado hace que la
	// gente reintente con archivos que el servidor va a rechazar igual.
	test("deriva el límite de USER_PHOTO.maxBytes", () => {
		const megabytes = USER_PHOTO.maxBytes / (1024 * 1024);

		expect(USER_PHOTO_HINT).toContain(`${megabytes} MB`);
	});

	test("nombra los formatos que acepta", () => {
		expect(USER_PHOTO_HINT).toContain("PNG");
		expect(USER_PHOTO_HINT).toContain("JPG");
		expect(USER_PHOTO_HINT).toContain("WEBP");
	});
});

describe("USER_LIST_DEFAULTS", () => {
	// Fuente única: antes estaban duplicados en el loader y en el repositorio, y
	// dos defaults distintos producen una `pagination` que no describe la página
	// que realmente se consultó.
	test("es la fuente única de los defaults del listado", () => {
		expect(USER_LIST_DEFAULTS).toEqual({ page: 1, pageSize: 10 });
	});

	// El pageSize por defecto tiene que caber bajo el tope compartido de 100, o el
	// propio default no pasaría la validación del filtro.
	test("su pageSize cabe bajo el tope compartido", () => {
		expect(USER_LIST_DEFAULTS.pageSize).toBeLessThanOrEqual(100);
		expect(USER_LIST_DEFAULTS.page).toBeGreaterThanOrEqual(1);
	});
});
