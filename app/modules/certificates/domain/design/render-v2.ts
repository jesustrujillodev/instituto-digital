import { escapeHtml } from "@/shared/html/escape-html";
import type {
	CertificateRenderData,
	CertificateRenderOptions,
} from "../certificate.types";
import { certificateQrSvg } from "../templates/qr";
import { safeColor } from "./color";
import { resolveTokens } from "./design.tokens";
import { BACKGROUND_DEFAULT_COLOR, CSS_PX_PER_PT } from "./design-v2.config";
import type {
	CertificateDesignV2,
	DesignElement,
	FolioElement,
	ImageElement,
	ImageSource,
	QrElement,
	ShapeElement,
	TextElement,
} from "./design-v2.schema";
import {
	FONT_CATALOG,
	FONT_IDS,
	type FontId,
	faceKeyOf,
	findFace,
} from "./font-catalog";
import { metricsOf } from "./font-metrics";
import { layoutText } from "./text-layout";

/** Lo que un elemento necesita para pintarse, ya resuelto por el documento. */
export interface ElementRenderContext {
	data: CertificateRenderData;
	/** La URL de una imagen o logo, o null si no hay forma segura de pintarla. */
	imageSrc: (src: ImageSource) => string | null;
}

/** Números cortos y estables en el CSS: 3 decimales bastan en puntos. */
const n = (value: number): string => String(Math.round(value * 1000) / 1000);

const textColor = (value: string) => safeColor(value, "#1f1f1f");

const fontStack = (font: FontId) => {
	const family = FONT_CATALOG[font];
	return `'${family.cssFamily}', ${family.fallback}`;
};

const typography = (
	element: TextElement | FolioElement,
	sizePt: number,
): string =>
	[
		`font-family:${fontStack(element.fontId)}`,
		`font-weight:${element.weight}`,
		`font-style:${element.italic ? "italic" : "normal"}`,
		`font-size:${n(sizePt)}pt`,
		`letter-spacing:${n(element.letterSpacing)}em`,
		`color:${textColor(element.color)}`,
	].join(";");

const casing = (text: string, uppercase: boolean) =>
	uppercase ? text.toLocaleUpperCase("es") : text;

const renderText = (element: TextElement, { data }: ElementRenderContext) => {
	const resolved = resolveTokens(element.content, data);
	const metrics = metricsOf(
		faceKeyOf(element.fontId, element.weight, element.italic),
	);
	if (resolved === null || !metrics) return "";

	const layout = layoutText({
		text: casing(resolved, element.uppercase),
		metrics,
		sizePt: element.sizePt,
		letterSpacing: element.letterSpacing,
		lineHeight: element.lineHeight,
		boxWidthPt: element.w,
		boxHeightPt: element.h,
		fit: element.fit,
		minSizePt: element.minSizePt,
	});
	const lineBox = n(layout.sizePt * element.lineHeight);
	const justify = element.align === "justify";

	const lines = layout.lines
		.map(({ text, endsParagraph }) => {
			const align =
				justify && !endsParagraph
					? "text-align:justify;text-align-last:justify;white-space:nowrap"
					: `text-align:${justify ? "left" : element.align};white-space:pre`;
			return `<div class="ln" style="height:${lineBox}pt;line-height:${lineBox}pt;${align}">${escapeHtml(text)}</div>`;
		})
		.join("");

	return `<div class="tx v-${element.vAlign}" style="${typography(element, layout.sizePt)}">${lines}</div>`;
};

const renderFolio = (element: FolioElement, { data }: ElementRenderContext) => {
	const text = casing(`${element.label}${data.folio}`, element.uppercase);
	const align = element.align === "justify" ? "left" : element.align;
	return `<div class="tx v-middle" style="${typography(element, element.sizePt)}"><div class="ln" style="text-align:${align};white-space:pre;line-height:1.2">${escapeHtml(text)}</div></div>`;
};

const renderShape = (element: ShapeElement) => {
	const stroke = element.stroke ? safeColor(element.stroke, "#000000") : null;
	const fill = element.fill ? safeColor(element.fill, "#000000") : "none";
	const width = stroke ? element.strokeWidth : 0;
	const half = width / 2;
	const paint = `fill="${element.kind === "line" ? "none" : fill}" stroke="${stroke ?? "none"}" stroke-width="${n(width)}"`;

	let shape: string;
	if (element.kind === "ellipse") {
		shape = `<ellipse cx="${n(element.w / 2)}" cy="${n(element.h / 2)}" rx="${n(Math.max(0, element.w / 2 - half))}" ry="${n(Math.max(0, element.h / 2 - half))}" ${paint}/>`;
	} else if (element.kind === "line") {
		shape = `<line x1="0" y1="${n(element.h / 2)}" x2="${n(element.w)}" y2="${n(element.h / 2)}" ${paint}/>`;
	} else {
		const radius = Math.min(
			element.cornerRadius,
			element.w / 2 - half,
			element.h / 2 - half,
		);
		shape = `<rect x="${n(half)}" y="${n(half)}" width="${n(Math.max(0, element.w - width))}" height="${n(Math.max(0, element.h - width))}" rx="${n(Math.max(0, radius))}" ${paint}/>`;
	}

	return `<svg class="fill" viewBox="0 0 ${n(element.w)} ${n(element.h)}" preserveAspectRatio="none" aria-hidden="true">${shape}</svg>`;
};

const renderImage = (element: ImageElement, context: ElementRenderContext) => {
	const src = context.imageSrc(element.src);
	return src
		? `<img class="fill" src="${escapeHtml(src)}" alt="" style="object-fit:${element.fit === "cover" ? "cover" : "contain"}">`
		: "";
};

const renderQr = (element: QrElement, { data }: ElementRenderContext) =>
	data.verificationUrl
		? certificateQrSvg(
				data.verificationUrl,
				"100%",
				safeColor(element.color, "#1f1f1f"),
			)
		: '<div class="qr-empty"></div>';

const renderContent = (
	element: DesignElement,
	context: ElementRenderContext,
): string => {
	switch (element.type) {
		case "text":
			return renderText(element, context);
		case "folio":
			return renderFolio(element, context);
		case "shape":
			return renderShape(element);
		case "image":
			return renderImage(element, context);
		case "qr":
			return renderQr(element, context);
		default: {
			const unreachable: never = element;
			return unreachable;
		}
	}
};

/**
 * Un elemento como `div` absoluto, con `data-el-id` para que el editor lo
 * reemplace sin rehacer el documento. Uno oculto deja el `div` vacío: así el
 * editor siempre tiene dónde parchear.
 */
export const renderElementHtml = (
	element: DesignElement,
	context: ElementRenderContext,
): string => {
	const style = [
		`left:${n(element.x)}pt`,
		`top:${n(element.y)}pt`,
		`width:${n(element.w)}pt`,
		`height:${n(element.h)}pt`,
		element.rotation ? `transform:rotate(${n(element.rotation)}deg)` : "",
		element.opacity < 1 ? `opacity:${n(element.opacity)}` : "",
	]
		.filter(Boolean)
		.join(";");
	const content = element.hidden ? "" : renderContent(element, context);
	return `<div class="el el-${element.type}" data-el-id="${escapeHtml(element.id)}" style="${style}">${content}</div>`;
};

/** Las caras del catálogo que el diseño usa, sin repetir. */
export const facesOf = (design: CertificateDesignV2) => {
	const faces = new Map<
		string,
		{ font: FontId; weight: number; italic: boolean; file: string }
	>();
	for (const element of design.elements) {
		if (element.type !== "text" && element.type !== "folio") continue;
		const face = findFace(element.fontId, element.weight, element.italic);
		if (!face) continue;
		faces.set(faceKeyOf(element.fontId, element.weight, element.italic), {
			font: element.fontId,
			weight: face.weight,
			italic: face.italic,
			file: face.file,
		});
	}
	return faces;
};

/** Los `@font-face` de las caras usadas, por URL o incrustados. */
export const fontFacesV2 = (
	design: CertificateDesignV2,
	assetBaseUrl: string,
	embedded?: Record<string, string>,
): string =>
	[...facesOf(design)]
		.map(([key, face]) => {
			const src = embedded?.[key] ?? `${assetBaseUrl}${face.file}`;
			return `@font-face { font-family: "${FONT_CATALOG[face.font].cssFamily}"; src: url("${src}") format("woff2"); font-weight: ${face.weight}; font-style: ${face.italic ? "italic" : "normal"}; font-display: block; }`;
		})
		.join("\n");

/** Lo que el elemento pinta para un tamaño de página dado. */
export const pageSizeCss = (design: CertificateDesignV2) =>
	`${n(design.page.widthPt)}pt ${n(design.page.heightPt)}pt`;

export const ELEMENT_STYLES = `
.cert .el { position: absolute; transform-origin: 50% 50%; }
.cert .fill { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.cert .tx { position: absolute; inset: 0; display: flex; flex-direction: column; font-kerning: normal; font-synthesis: none; }
.cert .v-top { justify-content: flex-start; }
.cert .v-middle { justify-content: center; }
.cert .v-bottom { justify-content: flex-end; }
.cert .ln { flex: none; overflow: visible; }
.cert .el-qr svg { display: block; width: 100%; height: 100%; }
.cert .qr-empty { width: 100%; height: 100%; border: 1pt dashed #9ca3af; }
.cert .bg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
`;

/** Resuelve las imágenes del diseño según haya o no recursos incrustados. */
export const imageResolverOf =
	(
		options: CertificateRenderOptions,
		safeUrl: (value: string | null) => string | null,
		builtinPath: (logoId: string) => string | null,
	) =>
	(src: ImageSource): string | null => {
		const { assets } = options;
		if (src.kind === "logo") {
			if (assets) return assets.logos[src.logoId] ?? null;
			const builtin = builtinPath(src.logoId);
			if (builtin) return `${options.assetBaseUrl}${builtin}`;
			return safeUrl(options.logoUrls?.[src.logoId] ?? null);
		}
		return assets ? (assets.images[src.ref] ?? null) : safeUrl(src.ref);
	};

/** El cuerpo y el CSS del diseño v2; el documento lo arma el renderer. */
export const renderDesignV2 = (
	design: CertificateDesignV2,
	data: CertificateRenderData,
	options: CertificateRenderOptions,
	imageSrc: ElementRenderContext["imageSrc"],
): { body: string; styles: string } => {
	const overlay = options.mode === "overlay";
	const { background } = design;
	const backgroundColor = overlay
		? "transparent"
		: background.kind === "color"
			? safeColor(background.color, BACKGROUND_DEFAULT_COLOR)
			: BACKGROUND_DEFAULT_COLOR;

	let backgroundImage = "";
	if (!overlay && background.kind === "pdf") {
		const raster = imageSrc({
			kind: "asset",
			ref: background.rasterRef,
			role: "image",
		});
		if (raster) {
			backgroundImage = `<img class="bg" src="${escapeHtml(raster)}" alt="">`;
		}
	}

	const context: ElementRenderContext = { data, imageSrc };
	const elements = design.elements
		.map((element) => renderElementHtml(element, context))
		.join("");

	const size = pageSizeCss(design);
	const styles = `${fontFacesV2(design, options.assetBaseUrl, options.assets?.faces)}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${n(design.page.widthPt)}pt; height: ${n(design.page.heightPt)}pt; background: ${backgroundColor}; }
body { -webkit-font-smoothing: antialiased; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: ${size}; margin: 0; }
.cert { width: ${n(design.page.widthPt)}pt; height: ${n(design.page.heightPt)}pt; position: relative; overflow: hidden; background: ${backgroundColor}; }
${ELEMENT_STYLES}`;

	return {
		body: `<div class="cert v2">${backgroundImage}${elements}</div>`,
		styles,
	};
};

/** Ancho de la página en px CSS, para el viewport del documento. */
export const pageWidthPx = (design: CertificateDesignV2) =>
	Math.ceil(design.page.widthPt * CSS_PX_PER_PT);

/**
 * Los `@font-face` de TODO el catálogo, con los mismos nombres que usa el
 * certificado: los necesita la página del editor para que el texto en edición
 * se vea con su fuente real.
 */
export const catalogFontFacesCss = (assetBaseUrl: string): string =>
	FONT_IDS.flatMap((font) =>
		FONT_CATALOG[font].faces.map(
			(face) =>
				`@font-face { font-family: "${FONT_CATALOG[font].cssFamily}"; src: url("${assetBaseUrl}${face.file}") format("woff2"); font-weight: ${face.weight}; font-style: ${face.italic ? "italic" : "normal"}; font-display: swap; }`,
		),
	).join("\n");

/** La pila CSS de una fuente del catálogo, para pintarla fuera del certificado. */
export const fontStackOf = (font: FontId): string => fontStack(font);
