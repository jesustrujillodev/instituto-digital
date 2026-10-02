import type {
	CertificateDesign,
	CertificateDesignV1,
} from "../certificate.types";
import { isDesignV2 } from "./design.schema";
import { CSS_PX_PER_PT } from "./design-v2.config";
import type { CertificateDesignV2 } from "./design-v2.schema";
import { facesOf } from "./render-v2";

// ── Tamaño y perfil de exportación ────────────────────────────────────────────

/** El lienzo del v1, en px CSS. Congelado con sus plantillas. */
export const V1_CANVAS_PX = { width: 1100, height: 780 } as const;

/** Lo que mide la página en px CSS: lo que escala la vista previa. */
export const pageBoxOf = (
	design: CertificateDesign,
): { width: number; height: number } =>
	isDesignV2(design)
		? {
				width: design.page.widthPt * CSS_PX_PER_PT,
				height: design.page.heightPt * CSS_PX_PER_PT,
			}
		: V1_CANVAS_PX;

/** PNG a 300 ppp: lo que una impresora de oficina aprovecha. */
export const PNG_DPI = 300;

export interface ExportProfile {
	format: "pdf" | "png";
	viewport: { width: number; height: number; deviceScaleFactor: number };
	/**
	 * `css`: el tamaño lo da `@page` (puppeteer no admite `pt`); `px`: tamaño
	 * explícito, como siempre lo exportó el v1.
	 */
	pdfPage: { mode: "css" } | { mode: "px"; width: number; height: number };
	/** Recorte exacto del PNG en px CSS, o null para el viewport entero. */
	clip: { width: number; height: number } | null;
	/** Fondo transparente: la capa que se estampa sobre un PDF de fondo. */
	transparent: boolean;
}

/**
 * Cómo exporta Chromium un diseño. El perfil v1 reproduce la llamada de
 * siempre (1100×780 px al doble) para que lo emitido no cambie.
 */
export const exportProfileOf = (
	design: CertificateDesign,
	format: "pdf" | "png",
	{ transparent = false }: { transparent?: boolean } = {},
): ExportProfile => {
	if (!isDesignV2(design)) {
		return {
			format,
			viewport: { ...V1_CANVAS_PX, deviceScaleFactor: 2 },
			pdfPage: { mode: "px", ...V1_CANVAS_PX },
			clip: null,
			transparent: false,
		};
	}

	const box = pageBoxOf(design);
	return {
		format,
		viewport: {
			width: Math.ceil(box.width),
			height: Math.ceil(box.height),
			deviceScaleFactor: PNG_DPI / 96,
		},
		pdfPage: { mode: "css" },
		clip: box,
		transparent,
	};
};

// ── Recursos ──────────────────────────────────────────────────────────────────

/** Lo que el servidor tiene que leer para incrustar en una exportación. */
export interface AssetManifest {
	/** Avant Garde y logo blanco de las plantillas v1. */
	legacy: boolean;
	faces: string[];
	logoIds: string[];
	/** Firmas, imágenes y el raster del fondo, por referencia del proxy. */
	imageRefs: string[];
}

const unique = (values: Iterable<string>) => [...new Set(values)];

const enabledSignatureRefs = (design: CertificateDesignV1) =>
	design.signatories.flatMap((signatory) =>
		signatory.enabled && signatory.signatureUrl ? [signatory.signatureUrl] : [],
	);

const visibleImagesOf = (design: CertificateDesignV2) =>
	design.elements.filter(
		(element) => element.type === "image" && !element.hidden,
	) as Extract<CertificateDesignV2["elements"][number], { type: "image" }>[];

/** Solo lo que el certificado imprime: nada de capas ocultas. */
export const assetManifestOf = (design: CertificateDesign): AssetManifest => {
	if (!isDesignV2(design)) {
		return {
			legacy: true,
			faces: [],
			logoIds: [],
			imageRefs: unique(enabledSignatureRefs(design)),
		};
	}

	const images = visibleImagesOf(design);
	return {
		legacy: false,
		faces: [...facesOf(design).keys()],
		logoIds: unique(
			images.flatMap((image) =>
				image.src.kind === "logo" ? [image.src.logoId] : [],
			),
		),
		imageRefs: unique([
			...images.flatMap((image) =>
				image.src.kind === "asset" ? [image.src.ref] : [],
			),
			...(design.background.kind === "pdf"
				? [design.background.rasterRef]
				: []),
		]),
	};
};

/** El PDF vectorial de fondo, si lo hay. */
export const backgroundPdfRefOf = (design: CertificateDesign): string | null =>
	isDesignV2(design) && design.background.kind === "pdf"
		? design.background.pdfRef
		: null;

/**
 * Toda referencia a storage que el diseño guarda, impresa o no: lo que el
 * gestor de nube no debe tratar como huérfano.
 */
export const storageRefsOf = (design: CertificateDesign): string[] => {
	if (!isDesignV2(design)) {
		return unique(
			design.signatories.flatMap((signatory) =>
				signatory.signatureUrl ? [signatory.signatureUrl] : [],
			),
		);
	}
	return unique([
		...design.elements.flatMap((element) =>
			element.type === "image" && element.src.kind === "asset"
				? [element.src.ref]
				: [],
		),
		...(design.background.kind === "pdf"
			? [design.background.pdfRef, design.background.rasterRef]
			: []),
	]);
};

/** Los logos que el diseño usa, impresos o no. */
export const logoIdsOf = (design: CertificateDesign): string[] =>
	isDesignV2(design)
		? unique(
				design.elements.flatMap((element) =>
					element.type === "image" && element.src.kind === "logo"
						? [element.src.logoId]
						: [],
				),
			)
		: [];

/** Prefijo con el que un logo subido entra a `asset_refs` de una emisión. */
export const LOGO_REF_PREFIX = "logo:";

/**
 * Lo que una emisión imprime y por tanto no se puede borrar de storage: las
 * referencias de sus imágenes y su fondo, y los logos subidos como `logo:<id>`.
 * Los logos integrados viven en el código y no cuentan.
 */
export const issuedAssetRefsOf = (
	design: CertificateDesign,
	isBuiltinLogo: (logoId: string) => boolean,
): string[] => {
	const manifest = assetManifestOf(design);
	const pdf = backgroundPdfRefOf(design);
	return unique([
		...manifest.imageRefs,
		...(pdf ? [pdf] : []),
		...manifest.logoIds
			.filter((logoId) => !isBuiltinLogo(logoId))
			.map((logoId) => `${LOGO_REF_PREFIX}${logoId}`),
	]);
};

/**
 * El diseño sin estas referencias: la firma v1 queda sin imagen; en v2 se
 * quitan las imágenes que las usan y un fondo PDF vuelve a blanco. Es lo que
 * suelta el gestor de nube antes de borrar el objeto.
 */
export const withoutAssetRefs = (
	design: CertificateDesign,
	refs: ReadonlySet<string>,
): { design: CertificateDesign; removed: number } => {
	let removed = 0;

	if (!isDesignV2(design)) {
		const signatories = design.signatories.map((signatory) => {
			if (!signatory.signatureUrl || !refs.has(signatory.signatureUrl)) {
				return signatory;
			}
			removed++;
			return { ...signatory, signatureUrl: null };
		}) as CertificateDesignV1["signatories"];
		return { design: { ...design, signatories }, removed };
	}

	const elements = design.elements.filter((element) => {
		const drop =
			element.type === "image" &&
			element.src.kind === "asset" &&
			refs.has(element.src.ref);
		if (drop) removed++;
		return !drop;
	});

	let background = design.background;
	if (
		background.kind === "pdf" &&
		(refs.has(background.pdfRef) || refs.has(background.rasterRef))
	) {
		removed++;
		background = { kind: "color", color: "#ffffff" };
	}

	return { design: { ...design, elements, background }, removed };
};
