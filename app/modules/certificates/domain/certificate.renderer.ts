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
	CertificateDesignV1,
	CertificateRenderData,
	CertificateRenderOptions,
	CertificateRenderResult,
} from "./certificate.types";
import { isDesignV2 } from "./design/design.schema";
import { builtinLogoOf } from "./design/logos";
import {
	imageResolverOf,
	pageWidthPx,
	renderDesignV2,
} from "./design/render-v2";
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
	if (!isDesignV2(design)) return renderV1(design, data, options);

	const { body, styles } = renderDesignV2(
		design,
		data,
		options,
		imageResolverOf(
			options,
			safeImageUrl,
			(logoId) => builtinLogoOf(logoId)?.path ?? null,
		),
	);
	return { html: documentOf(pageWidthPx(design), body), styles };
};

const documentOf = (viewportWidth: number, body: string) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${viewportWidth}">
<title>Constancia</title>
</head>
<body>${body}</body>
</html>`;

/** Las plantillas del gestor anterior. Congelado: ver las pruebas golden. */
const renderV1 = (
	design: CertificateDesignV1,
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
			? (ref) => (ref ? (assets.images[ref] ?? null) : null)
			: safeImageUrl,
		description,
	});

	return {
		html: documentOf(CERTIFICATE_CANVAS.width, body),
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
