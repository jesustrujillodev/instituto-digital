import {
	CERTIFICATE_CANVAS,
	CERTIFICATE_LOGO_PATH,
} from "./certificate.config";
import {
	type CertificateTemplateId,
	resolveTemplateId,
	safeAccent,
	safeImageUrl,
} from "./certificate.rules";
import type {
	CertificateDesign,
	CertificateRenderData,
	CertificateRenderOptions,
	CertificateRenderResult,
} from "./certificate.types";
import { renderInstitucional } from "./templates/institucional";
import { renderMarco } from "./templates/marco";
import { renderMinima } from "./templates/minima";
import {
	BASE_STYLES,
	fontFaces,
	type TemplateRenderer,
} from "./templates/shared";

/** Añadir una plantilla es una entrada más: el `Record` no compila si falta. */
export const TEMPLATE_RENDERERS: Record<
	CertificateTemplateId,
	TemplateRenderer
> = {
	institucional: renderInstitucional,
	minima: renderMinima,
	marco: renderMarco,
};

/**
 * El certificado como HTML y su CSS por separado.
 *
 * Es el ÚNICO motor de dibujo: la vista previa, el PDF y el PNG salen de aquí,
 * así que no pueden divergir. Todo lo que no es de fiar se sanea antes de
 * llegar a la plantilla: la plantilla, el acento y —dentro de cada bloque— el
 * texto y las URLs de firma.
 *
 * Con `options.assets` el documento queda autocontenido: fuentes, logo y firmas
 * van como data URIs que produjo el servidor, y una firma que no esté entre
 * ellos no se pinta. Es lo que exporta Chromium, que no tiene red ni sesión.
 */
export const renderCertificate = (
	design: CertificateDesign,
	data: CertificateRenderData,
	options: CertificateRenderOptions,
): CertificateRenderResult => {
	const { assets } = options;
	const templateId = resolveTemplateId(design.templateId);
	const description =
		design.description.trim() || data.courseDescription.trim() || null;

	const { body, styles } = TEMPLATE_RENDERERS[templateId]({
		design: {
			...design,
			templateId,
			accentColor: safeAccent(design.accentColor),
		},
		data,
		logoUrl: assets?.logo ?? `${options.assetBaseUrl}${CERTIFICATE_LOGO_PATH}`,
		signatureSrc: assets
			? (ref) => (ref ? (assets.signatures[ref] ?? null) : null)
			: safeImageUrl,
		description,
	});

	const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${CERTIFICATE_CANVAS.width}">
<title>Constancia</title>
</head>
<body>${body}</body>
</html>`;

	return {
		html,
		styles: `${fontFaces(options.assetBaseUrl, assets?.fonts)}\n${BASE_STYLES}\n${styles}`,
	};
};

/** El mismo certificado como documento único, con el CSS dentro: el del iframe. */
export const renderCertificateDocument = (
	design: CertificateDesign,
	data: CertificateRenderData,
	options: CertificateRenderOptions,
): string => {
	const { html, styles } = renderCertificate(design, data, options);
	return html.replace("</head>", `<style>${styles}</style>\n</head>`);
};
