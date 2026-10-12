import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Logger } from "@/shared/logging/logger";
import { createS3StorageProvider } from "../s3.adapter";

/**
 * Con el SDK real, sin dobles: firmar no necesita red, y lo que importa es la
 * URL que sale del presigner. `s3.adapter.test.ts` lo sustituye y no lo ve.
 */
const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const provider = () =>
	createS3StorageProvider(
		{
			region: "us-east-1",
			endpoint: "http://storage.invalid:9000",
			forcePathStyle: true,
			accessKeyId: "AKIAPRUEBA",
			secretAccessKey: "secreto-de-prueba",
		},
		silentLogger,
	);

const uploadUrlFor = (contentType: string) =>
	provider().getUploadUrl("privado", "documentos/lecciones/guia-1.pdf", {
		contentType,
		expiresInSeconds: 900,
	});

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
});

afterEach(() => {
	vi.useRealTimers();
});

describe("getUploadUrl con el presigner real", () => {
	// El hallazgo: el presigner excluye Content-Type de la firma salvo que se
	// pida, y la URL de un PDF servía para subir un HTML.
	test("firma el Content-Type: la URL de un PDF no sirve para un HTML", async () => {
		const pdf = new URL(await uploadUrlFor("application/pdf"));
		const html = new URL(await uploadUrlFor("text/html"));

		expect(pdf.searchParams.get("X-Amz-SignedHeaders")).toBe(
			"content-type;host",
		);
		expect(pdf.searchParams.get("X-Amz-Signature")).not.toBe(
			html.searchParams.get("X-Amz-Signature"),
		);
	});

	// El checksum por defecto del SDK se calcula sobre un cuerpo vacío: un
	// proveedor que lo valide rechazaría toda subida con contenido.
	test("no lleva el checksum de un cuerpo vacío", async () => {
		const url = new URL(await uploadUrlFor("application/pdf"));

		expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
		expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
	});

	test("conserva la key y la vigencia pedida", async () => {
		const url = new URL(await uploadUrlFor("application/pdf"));

		expect(url.pathname).toBe("/privado/documentos/lecciones/guia-1.pdf");
		expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
	});
});
