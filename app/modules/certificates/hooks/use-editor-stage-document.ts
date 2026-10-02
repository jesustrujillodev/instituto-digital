import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { renderCertificateDocument } from "../domain/certificate.renderer";
import { safeImageUrl } from "../domain/certificate.rules";
import type { CertificateRenderData } from "../domain/certificate.types";
import type { CertificateDesignV2 } from "../domain/design/design-v2.schema";
import { builtinLogoOf } from "../domain/design/logos";
import {
	facesOf,
	imageResolverOf,
	renderElementHtml,
} from "../domain/design/render-v2";

interface StageDocumentOptions {
	design: CertificateDesignV2;
	data: CertificateRenderData;
	logoUrls: Record<string, string>;
	/** El elemento que se está editando en línea: se oculta bajo el textarea. */
	editingId: string | null;
}

/** Lo que obliga a reescribir el documento: página, fondo, fuentes u orden. */
const structureOf = (design: CertificateDesignV2) =>
	JSON.stringify([
		design.page,
		design.background,
		[...facesOf(design).keys()].sort(),
		design.elements.map((element) => element.id),
	]);

/**
 * El documento del lienzo dentro del `iframe`, al día con el diseño.
 *
 * Escribir el documento entero en cada cambio haría parpadear el lienzo y
 * recargaría fuentes e imágenes. Así que solo se reescribe cuando cambia su
 * estructura; lo demás se parchea por `data-el-id`, reemplazando el HTML de
 * los elementos que cambiaron (el diseño es inmutable: comparar por identidad
 * basta). El `iframe` va sin `allow-scripts`, pero con `allow-same-origin` el
 * padre puede escribir en su documento.
 */
export function useEditorStageDocument(
	frame: RefObject<HTMLIFrameElement | null>,
	{ design, data, logoUrls, editingId }: StageDocumentOptions,
) {
	const [generation, setGeneration] = useState(0);
	const rendered = useRef<{
		structure: string;
		data: CertificateRenderData;
		logoUrls: Record<string, string>;
		elements: Map<string, CertificateDesignV2["elements"][number]>;
	} | null>(null);

	useEffect(() => {
		const document = frame.current?.contentDocument;
		if (!document) return;

		// Cada recarga del iframe es un documento nuevo: cuenta como otra estructura.
		const structure = `${generation}:${structureOf(design)}`;
		const previous = rendered.current;
		const imageSrc = imageResolverOf(
			{ assetBaseUrl: "", logoUrls },
			safeImageUrl,
			(logoId) => builtinLogoOf(logoId)?.path ?? null,
		);

		if (
			!previous ||
			previous.structure !== structure ||
			previous.data !== data ||
			previous.logoUrls !== logoUrls
		) {
			document.open();
			document.write(
				renderCertificateDocument(design, data, { assetBaseUrl: "", logoUrls }),
			);
			document.close();
		} else {
			for (const element of design.elements) {
				if (previous.elements.get(element.id) === element) continue;
				const node = document.querySelector(
					`[data-el-id="${CSS.escape(element.id)}"]`,
				);
				if (node)
					node.outerHTML = renderElementHtml(element, { data, imageSrc });
			}
		}

		rendered.current = {
			structure,
			data,
			logoUrls,
			elements: new Map(
				design.elements.map((element) => [element.id, element]),
			),
		};
	}, [frame, design, data, logoUrls, generation]);

	useEffect(() => {
		const document = frame.current?.contentDocument;
		// El parche reemplaza el nodo: tras cada cambio del diseño hay que volver
		// a ocultar el que se está editando.
		if (
			!document ||
			!editingId ||
			!design.elements.some((e) => e.id === editingId)
		) {
			return;
		}
		const node = document.querySelector<HTMLElement>(
			`[data-el-id="${CSS.escape(editingId)}"]`,
		);
		if (!node) return;
		node.style.visibility = "hidden";
		return () => {
			node.style.visibility = "";
		};
	}, [frame, editingId, design]);

	/**
	 * Para el `onLoad` del iframe. Algunos navegadores cambian el `about:blank`
	 * inicial por otro documento después de montarlo: si el lienzo desapareció,
	 * se vuelve a escribir. Escribirlo dispara otro `load`, pero ya con lienzo.
	 */
	return useCallback(() => {
		if (frame.current?.contentDocument?.querySelector(".cert")) return;
		rendered.current = null;
		setGeneration((value) => value + 1);
	}, [frame]);
}
