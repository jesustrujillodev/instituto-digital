import { describe, expect, test } from "vitest";
import { toProxyRef } from "@/shared/storage/public-url";
import {
	assetFileNameOf,
	certificateAssetFolderOf,
	courseOfCertificateAssetKey,
	isOwnCertificateAssetRef,
	looksLikePdf,
	rasterDpiFor,
	rasterMatches,
	sniffImageType,
	svgRejectionOf,
} from "../certificate-assets.rules";

const COURSE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("propiedad de los recursos", () => {
	test("la carpeta de un curso", () => {
		expect(certificateAssetFolderOf(COURSE, "image")).toBe(
			`documentos/certificados/${COURSE}/imagenes`,
		);
		expect(certificateAssetFolderOf(COURSE, "background")).toBe(
			`documentos/certificados/${COURSE}/fondos`,
		);
	});

	test.each([
		[`documentos/certificados/${COURSE}/imagenes/a.png`, COURSE],
		[`documentos/certificados/${COURSE}/fondos/a.pdf`, COURSE],
		[`documentos/firmas/${COURSE}/a.png`, COURSE],
		[`documentos/certificados/${COURSE}/otra/a.png`, null],
		[`documentos/certificados/${COURSE}/imagenes/x/a.png`, null],
		[`documentos/certificados/${COURSE}/imagenes/../a.png`, null],
		[`documentos/firmas/${COURSE}/x/a.png`, null],
		[`documentos/firmas/${COURSE}`, null],
		["media/logos/a.png", null],
	])("%s es del curso %s", (key, course) => {
		expect(courseOfCertificateAssetKey(key)).toBe(course);
	});

	test("solo acepta la referencia del proxy de una key del propio curso", () => {
		const key = `documentos/certificados/${COURSE}/imagenes/a.png`;
		expect(isOwnCertificateAssetRef(toProxyRef(key), COURSE)).toBe(true);
		expect(isOwnCertificateAssetRef(toProxyRef(key), OTHER)).toBe(false);
		expect(isOwnCertificateAssetRef(`/api/storage?key=${key}`, COURSE)).toBe(
			false,
		);
		expect(isOwnCertificateAssetRef("blob:http://x/1", COURSE)).toBe(false);
		expect(isOwnCertificateAssetRef("/api/storage?nada=1", COURSE)).toBe(false);
	});

	test("el nombre guardado lleva la extensión del tipo real", () => {
		expect(assetFileNameOf("logo.png", "svg")).toBe("logo.svg");
		expect(assetFileNameOf("foto", "jpeg")).toBe("foto.jpg");
		expect(assetFileNameOf(".png", "webp")).toBe(".png.webp");
		expect(assetFileNameOf("", "png")).toBe("imagen.png");
	});
});

describe("tipo por bytes", () => {
	test.each([
		[bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "png"],
		[bytes(0xff, 0xd8, 0xff, 0xe0), "jpeg"],
		[text("RIFF\0\0\0\0WEBPVP8 "), "webp"],
		[text('<?xml version="1.0"?>\n<!-- x -->\n<svg xmlns="x"></svg>'), "svg"],
		[text("﻿  <svg>"), "svg"],
		[text("<html><svg>"), null],
		[text("GIF89a"), null],
	])("%#", (input, type) => {
		expect(sniffImageType(input)).toBe(type);
	});

	test("un PDF empieza por %PDF-", () => {
		expect(looksLikePdf(text("%PDF-1.7"))).toBe(true);
		expect(looksLikePdf(text("<svg>"))).toBe(false);
	});
});

describe("SVG", () => {
	test("acepta un SVG de dibujo, con referencias internas", () => {
		expect(
			svgRejectionOf(
				'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use xlink:href="#g"/></svg>',
			),
		).toBeNull();
	});

	test.each([
		["<svg><script>alert(1)</script></svg>", "contiene scripts"],
		['<svg onload="alert(1)"></svg>', "contiene manejadores de eventos"],
		[
			'<svg><a href="javascript:alert(1)"/></svg>',
			"contiene enlaces a JavaScript",
		],
		["<svg><foreignObject><div/></foreignObject></svg>", "incrusta HTML"],
		['<!DOCTYPE svg [<!ENTITY x "y">]><svg/>', "declara entidades"],
		["<svg><style>@import 'x.css';</style></svg>", "importa estilos externos"],
		['<svg><image href="https://x/a.png"/></svg>', "enlaza recursos externos"],
		['<svg><rect fill="url(https://x/a)"/></svg>', "carga recursos externos"],
	])("rechaza %s", (svg, reason) => {
		expect(svgRejectionOf(svg)).toBe(reason);
	});
});

describe("raster del fondo", () => {
	test("300 ppp para A4; menos para una página grande", () => {
		expect(rasterDpiFor(841.89, 595.28)).toBe(300);
		expect(rasterDpiFor(1191, 1191)).toBeLessThan(300);
	});

	test("el raster corresponde a la página y a su resolución", () => {
		const page = { widthPt: 841.89, heightPt: 595.28 };
		expect(rasterMatches({ widthPx: 3508, heightPx: 2480 }, page, 300)).toBe(
			true,
		);
		expect(rasterMatches({ widthPx: 3506, heightPx: 2482 }, page, 300)).toBe(
			true,
		);
		expect(rasterMatches({ widthPx: 3500, heightPx: 2480 }, page, 300)).toBe(
			false,
		);
		expect(rasterMatches({ widthPx: 1754, heightPx: 1240 }, page, 150)).toBe(
			true,
		);
		expect(rasterMatches({ widthPx: 4677, heightPx: 3307 }, page, 400)).toBe(
			false,
		);
	});
});
