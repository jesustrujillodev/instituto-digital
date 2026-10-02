import {
	PAGE_PRESETS,
	QR_MIN_SIDE_PT,
} from "../../domain/design/design-v2.config";
import type {
	CertificateDesignV2,
	DesignElement,
	DesignPage,
	TextElement,
} from "../../domain/design/design-v2.schema";
import { faceKeyOf } from "../../domain/design/font-catalog";
import { metricsOf } from "../../domain/design/font-metrics";
import { aabbOf } from "../../domain/design/geometry";
import { layoutText } from "../../domain/design/text-layout";
import { isMandatory } from "./elements";
import { roundPt } from "./geometry";

/** La página de un tamaño y orientación del catálogo. */
export const pageOf = (
	preset: "A4" | "LETTER",
	orientation: DesignPage["orientation"],
): DesignPage => {
	const { widthPt, heightPt } = PAGE_PRESETS[preset];
	const long = Math.max(widthPt, heightPt);
	const short = Math.min(widthPt, heightPt);
	return orientation === "landscape"
		? { preset, orientation, widthPt: long, heightPt: short }
		: { preset, orientation, widthPt: short, heightPt: long };
};

/** Mete un elemento obligatorio dentro de la página, sin cambiar su tamaño. */
const insidePage = (
	element: DesignElement,
	page: DesignPage,
): DesignElement => {
	const box = aabbOf(element);
	const dx = Math.min(0, page.widthPt - (box.x + box.w)) - Math.min(0, box.x);
	const dy = Math.min(0, page.heightPt - (box.y + box.h)) - Math.min(0, box.y);
	return dx === 0 && dy === 0
		? element
		: { ...element, x: roundPt(element.x + dx), y: roundPt(element.y + dy) };
};

/**
 * El diseño en otra página. Las posiciones se llevan en proporción y los
 * tamaños se conservan; QR y folio quedan dentro, porque el certificado no se
 * puede guardar con ellos fuera.
 */
export const resizePage = (
	design: CertificateDesignV2,
	page: DesignPage,
): CertificateDesignV2 => {
	const sx = page.widthPt / design.page.widthPt;
	const sy = page.heightPt / design.page.heightPt;
	return {
		...design,
		page,
		elements: design.elements.map((element) => {
			const moved = {
				...element,
				x: roundPt((element.x + element.w / 2) * sx - element.w / 2),
				y: roundPt((element.y + element.h / 2) * sy - element.h / 2),
			};
			return isMandatory(moved) ? insidePage(moved, page) : moved;
		}),
	};
};

/**
 * El alto que necesita un texto que se ajusta por renglones, para que la caja
 * crezca mientras se escribe, como en Canva. Un texto con campos dinámicos o
 * que baja de cuerpo conserva su caja: su largo real se sabe al emitir.
 */
export const grownTextHeight = (element: TextElement): number => {
	if (element.fit !== "wrap") return element.h;
	const metrics = metricsOf(
		faceKeyOf(element.fontId, element.weight, element.italic),
	);
	if (!metrics) return element.h;

	const text = element.uppercase
		? element.content.toLocaleUpperCase("es")
		: element.content;
	const { lines } = layoutText({
		text,
		metrics,
		sizePt: element.sizePt,
		letterSpacing: element.letterSpacing,
		lineHeight: element.lineHeight,
		boxWidthPt: element.w,
		boxHeightPt: element.h,
		fit: "wrap",
		minSizePt: element.minSizePt,
	});
	const needed = roundPt(lines.length * element.sizePt * element.lineHeight);
	return Math.max(element.h, needed);
};

/**
 * Escala un grupo desde la esquina contraria al tirador: posiciones y tamaños
 * en proporción a la caja del grupo. Los textos no cambian de cuerpo.
 */
export const scaleGroup = (
	elements: readonly DesignElement[],
	from: { x: number; y: number; w: number; h: number },
	to: { x: number; y: number; w: number; h: number },
): DesignElement[] => {
	const sx = to.w / from.w;
	const sy = to.h / from.h;
	return elements.map((element) => {
		if (element.locked) return element;
		const square = element.type === "qr";
		const w = square
			? Math.max(QR_MIN_SIDE_PT, element.w * Math.min(sx, sy))
			: element.w * sx;
		const h = square ? w : element.h * sy;
		const cx = to.x + (element.x + element.w / 2 - from.x) * sx;
		const cy = to.y + (element.y + element.h / 2 - from.y) * sy;
		return {
			...element,
			x: roundPt(cx - w / 2),
			y: roundPt(cy - h / 2),
			w: roundPt(w),
			h: roundPt(h),
		};
	});
};
