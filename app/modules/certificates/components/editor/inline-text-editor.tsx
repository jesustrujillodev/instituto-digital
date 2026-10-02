import { useEffect, useRef } from "react";
import type { TextElement } from "../../domain/design/design-v2.schema";
import { faceKeyOf } from "../../domain/design/font-catalog";
import { metricsOf } from "../../domain/design/font-metrics";
import { fontStackOf } from "../../domain/design/render-v2";
import { layoutText } from "../../domain/design/text-layout";

interface InlineTextEditorProps {
	element: TextElement;
	/** px de pantalla por punto. */
	scale: number;
	onChange: (content: string) => void;
	onDone: () => void;
}

/**
 * El texto se edita sobre el lienzo, con su fuente, cuerpo, interlineado y
 * color: el elemento del `iframe` se oculta mientras tanto. Se ve lo que se
 * escribe (los campos entre llaves, sin resolver); al salir, el lienzo vuelve
 * a pintar el resultado real.
 */
export function InlineTextEditor({
	element,
	scale,
	onChange,
	onDone,
}: InlineTextEditorProps) {
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const textarea = ref.current;
		if (!textarea) return;
		textarea.focus();
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
	}, []);

	const pxPerPt = scale;
	const metrics = metricsOf(
		faceKeyOf(element.fontId, element.weight, element.italic),
	);
	const lines = metrics
		? layoutText({
				text: element.content,
				metrics,
				sizePt: element.sizePt,
				letterSpacing: element.letterSpacing,
				lineHeight: element.lineHeight,
				boxWidthPt: element.w,
				boxHeightPt: element.h,
				fit: "wrap",
				minSizePt: element.minSizePt,
			}).lines.length
		: 1;
	const textHeight = lines * element.sizePt * element.lineHeight;
	const free = Math.max(0, element.h - textHeight);
	const paddingTop =
		element.vAlign === "middle"
			? free / 2
			: element.vAlign === "bottom"
				? free
				: 0;

	return (
		<textarea
			ref={ref}
			aria-label="Texto del elemento"
			value={element.content}
			spellCheck
			onChange={(event) => onChange(event.target.value)}
			onBlur={onDone}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") onDone();
			}}
			className="absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-1 outline-primary outline-dashed"
			style={{
				left: element.x * pxPerPt,
				top: element.y * pxPerPt,
				width: element.w * pxPerPt,
				height: Math.max(element.h, textHeight) * pxPerPt,
				paddingTop: paddingTop * pxPerPt,
				transform: element.rotation
					? `rotate(${element.rotation}deg)`
					: undefined,
				fontFamily: fontStackOf(element.fontId),
				fontWeight: element.weight,
				fontStyle: element.italic ? "italic" : "normal",
				fontSize: element.sizePt * pxPerPt,
				lineHeight: element.lineHeight,
				letterSpacing: `${element.letterSpacing}em`,
				textTransform: element.uppercase ? "uppercase" : "none",
				textAlign: element.align === "justify" ? "left" : element.align,
				color: element.color,
				fontKerning: "normal",
			}}
		/>
	);
}
