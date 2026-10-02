import {
	FilePlus2,
	RectangleHorizontal,
	RectangleVertical,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
	CertificateDesignV2,
	CertificateRenderData,
} from "../../domain/certificate.types";
import { blankDesign } from "../../domain/design/design.presets";
import { pageOf } from "../../utils/editor/page";
import { DesignThumbnail } from "./design-thumbnail";
import { SegmentedControl } from "./fields";

interface BlankDesignPickerProps {
	data: CertificateRenderData;
	logoUrls: Record<string, string>;
	folioFormat: string;
	/** La página con la que arranca la elección; Carta horizontal si es de un PDF. */
	initialPage?: CertificateDesignV2["page"];
	readOnly?: boolean;
	/** `wide`: miniatura y controles lado a lado (diálogo); `narrow`: apilados (panel). */
	layout: "wide" | "narrow";
	onChoose: (design: CertificateDesignV2) => void;
}

/**
 * Un documento en blanco del tamaño que se elija: solo lo obligatorio, el QR
 * de verificación y el folio.
 */
export function BlankDesignPicker({
	data,
	logoUrls,
	folioFormat,
	initialPage,
	readOnly = false,
	layout,
	onChoose,
}: BlankDesignPickerProps) {
	const known = initialPage && initialPage.preset !== "CUSTOM";
	const [size, setSize] = useState<"A4" | "LETTER">(
		known ? (initialPage.preset as "A4" | "LETTER") : "LETTER",
	);
	const [orientation, setOrientation] = useState<"landscape" | "portrait">(
		known ? initialPage.orientation : "landscape",
	);
	const blank = useMemo(
		() => blankDesign(pageOf(size, orientation), folioFormat),
		[size, orientation, folioFormat],
	);

	return (
		<div
			className={cn(
				"grid gap-4",
				layout === "wide"
					? "items-end sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
					: "grid-cols-1",
			)}
		>
			<button
				type="button"
				disabled={readOnly}
				onClick={() => onChoose(blank)}
				className={cn(
					"flex flex-col gap-1.5 rounded-md p-1 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
					layout === "narrow" && "order-last mx-auto w-2/3",
				)}
			>
				<DesignThumbnail
					design={blank}
					data={data}
					logoUrls={logoUrls}
					label="Documento en blanco"
				/>
				<span className="flex items-center gap-1.5">
					<FilePlus2 className="size-3.5" aria-hidden="true" />
					Empezar en blanco
				</span>
			</button>
			<div className="flex flex-col gap-3">
				<SegmentedControl
					label="Tamaño"
					value={size}
					onChange={setSize}
					disabled={readOnly}
					options={[
						{ value: "LETTER", label: "Carta" },
						{ value: "A4", label: "A4" },
					]}
				/>
				<SegmentedControl
					label="Orientación"
					value={orientation}
					onChange={setOrientation}
					disabled={readOnly}
					options={[
						{
							value: "landscape",
							label: "Horizontal",
							icon: <RectangleHorizontal className="size-3.5" />,
						},
						{
							value: "portrait",
							label: "Vertical",
							icon: <RectangleVertical className="size-3.5" />,
						},
					]}
				/>
				<p className="text-muted-foreground text-xs">
					Solo lleva lo obligatorio: el QR de verificación y el folio.
				</p>
			</div>
		</div>
	);
}
