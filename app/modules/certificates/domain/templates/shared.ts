import { escapeHtml } from "@/shared/html/escape-html";
import {
	CERTIFICATE_CANVAS,
	CERTIFICATE_FONT_DIR,
	CERTIFICATE_FONT_FILES,
	CERTIFICATE_QR_SIZE,
} from "../certificate.config";
import type {
	CertificateAssets,
	CertificateDesign,
	CertificateRenderData,
	CertificateSignatory,
} from "../certificate.types";
import { certificateQrSvg } from "./qr";

/** Lo que recibe una plantilla, ya saneado por el renderer. */
export interface TemplateContext {
	/** Con el acento validado y la plantilla resuelta. */
	design: CertificateDesign;
	data: CertificateRenderData;
	logoUrl: string;
	/** La imagen de una firma ya resuelta y saneada, o null para omitirla. */
	signatureSrc: (ref: string | null) => string | null;
	/** La del diseño o, si está vacía, la del curso; null si no hay ninguna. */
	description: string | null;
}

export type TemplateRenderer = (context: TemplateContext) => {
	body: string;
	styles: string;
};

export const SANS = '"ITC Avant Garde Std", Arial, sans-serif';
export const SERIF = 'Georgia, "Times New Roman", serif';

/**
 * Los `@font-face` de `app.css`: resueltos contra la base del documento o, al
 * exportar, incrustados como data URIs.
 */
export const fontFaces = (
	assetBaseUrl: string,
	fonts?: CertificateAssets["fonts"],
): string =>
	CERTIFICATE_FONT_FILES.map(([file, weight]) => {
		const url = `${assetBaseUrl}${CERTIFICATE_FONT_DIR}/ITCAvantGardeStd-${file}`;
		const src = fonts
			? `url("${fonts[file]}") format("woff2")`
			: `url("${url}.woff2") format("woff2"), url("${url}.woff") format("woff")`;
		return `@font-face { font-family: "ITC Avant Garde Std"; src: ${src}; font-weight: ${weight}; font-style: normal; font-display: block; }`;
	}).join("\n");

/** `print-color-adjust` o los fondos de acento desaparecen al exportar. */
export const BASE_STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${CERTIFICATE_CANVAS.width}px; height: ${CERTIFICATE_CANVAS.height}px; background: #ffffff; }
body { -webkit-font-smoothing: antialiased; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: ${CERTIFICATE_CANVAS.width}px ${CERTIFICATE_CANVAS.height}px; margin: 0; }
.cert { width: ${CERTIFICATE_CANVAS.width}px; height: ${CERTIFICATE_CANVAS.height}px; position: relative; overflow: hidden; }
`;

/**
 * Clase según el largo del texto, para bajar el cuerpo de letra de un nombre o
 * un título largo sin medirlo: el renderer no tiene DOM.
 */
export const lengthClass = (
	value: string,
	[long, longer]: readonly [number, number],
): string =>
	value.length > longer ? "is-longer" : value.length > long ? "is-long" : "";

/** Mezcla el acento con blanco (`amount` > 0) o con negro (< 0). */
export const shade = (hex: string, amount: number): string => {
	const target = amount > 0 ? 255 : 0;
	const weight = Math.abs(amount);
	const channel = (offset: number) => {
		const value = Number.parseInt(hex.slice(offset, offset + 2), 16);
		return Math.round(value + (target - value) * weight)
			.toString(16)
			.padStart(2, "0");
	};

	return `#${channel(1)}${channel(3)}${channel(5)}`;
};

/**
 * Una celda del pie para un firmante.
 *
 * Apagado deja la celda VACÍA, no la quita: la rejilla del pie conserva sus
 * columnas y nada se corre al activar o desactivar una firma.
 */
export const renderSignatory = (
	signatory: CertificateSignatory,
	signatureSrc: TemplateContext["signatureSrc"],
): string => {
	if (!signatory.enabled) {
		return '<div class="cell sig is-off" aria-hidden="true"></div>';
	}

	const image = signatureSrc(signatory.signatureUrl);

	return `<div class="cell sig">
		<div class="sig-slot">${image ? `<img src="${escapeHtml(image)}" alt="">` : ""}</div>
		<div class="sig-name">${escapeHtml(signatory.name)}</div>
		<div class="sig-role">${escapeHtml(signatory.role)}</div>
	</div>`;
};

export const renderMeta = (label: string, value: string, extra = ""): string =>
	`<div class="cell meta">
		${extra}
		<div class="meta-label">${escapeHtml(label)}</div>
		<div class="meta-value">${escapeHtml(value)}</div>
	</div>`;

/** El QR de verificación, sobre el folio. Sin dirección no se pinta nada. */
const renderQr = (url: string | null | undefined): string =>
	url
		? `<div class="qr">${certificateQrSvg(url, CERTIFICATE_QR_SIZE)}</div>`
		: "";

/**
 * El pie de las tres plantillas: dos firmas, fecha y folio, en cuatro columnas
 * que existen siempre.
 */
export const renderFooter = ({
	design,
	data,
	signatureSrc,
}: TemplateContext): string =>
	`<div class="footer">
		${renderSignatory(design.signatories[0], signatureSrc)}
		${renderSignatory(design.signatories[1], signatureSrc)}
		${renderMeta("Fecha de emisión", data.issuedOn)}
		${renderMeta("Folio", data.folio, renderQr(data.verificationUrl))}
	</div>`;

/**
 * Estilos del pie bajo la raíz de una plantilla.
 *
 * Las celdas se alinean ARRIBA y el hueco de la firma tiene alto fijo: con
 * imagen o sin ella, y con nombres de una línea o de dos, las líneas de firma
 * quedan a la misma altura. Los metadatos bajan lo mismo que ocupa ese hueco.
 */
export const footerStyles = (root: string, accent: string): string => `
${root} .footer { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; align-items: start; }
${root} .cell { min-width: 0; font-family: ${SANS}; text-align: center; }
${root} .sig-slot { height: 52px; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid ${accent}; margin-bottom: 8px; }
${root} .sig-slot img { max-height: 48px; max-width: 100%; object-fit: contain; }
${root} .sig-name, ${root} .meta-value { font-size: 13px; font-weight: 600; color: #383838; overflow-wrap: anywhere; }
${root} .sig-role, ${root} .meta-label { font-size: 11px; color: #6b6b6b; text-transform: uppercase; letter-spacing: 0.08em; overflow-wrap: anywhere; }
${root} .sig-name, ${root} .sig-role { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
${root} .meta { padding-top: 60px; position: relative; }
${root} .qr { position: absolute; left: 50%; bottom: calc(100% - 56px); transform: translateX(-50%); width: ${CERTIFICATE_QR_SIZE}px; height: ${CERTIFICATE_QR_SIZE}px; }
${root} .qr svg { display: block; }
${root} .meta-label { margin-bottom: 6px; }
`;

/** El cuerpo común: a quién, qué curso, cuánto duró y la descripción. */
export const renderStatement = ({
	design,
	data,
	description,
}: TemplateContext): string => `
	${design.subtitle ? `<div class="subtitle">${escapeHtml(design.subtitle)}</div>` : ""}
	<div class="lead">Otorga la presente constancia a</div>
	<div class="recipient ${lengthClass(data.recipientName, [28, 44])}">${escapeHtml(data.recipientName)}</div>
	<div class="lead">por haber acreditado el curso</div>
	<div class="course ${lengthClass(data.courseTitle, [60, 100])}">${escapeHtml(data.courseTitle)}</div>
	${data.hours ? `<div class="hours">Con una duración de ${escapeHtml(data.hours)}</div>` : ""}
	${description ? `<div class="description">${escapeHtml(description)}</div>` : ""}
`;
