import {
	Eraser,
	FileUp,
	RectangleHorizontal,
	RectangleVertical,
	X,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import {
	BACKGROUND_DEFAULT_COLOR,
	PAGE_PRESETS,
} from "../../domain/design/design-v2.config";
import type {
	CertificateDesignV2,
	DesignPage,
} from "../../domain/design/design-v2.schema";
import { hasDecoration } from "../../utils/editor/commands";
import { pageOf } from "../../utils/editor/page";
import { ColorField } from "./color-field";
import { PropertyRow, PropertySection, SegmentedControl } from "./fields";

interface PagePanelProps {
	design: CertificateDesignV2;
	documentColors: readonly string[];
	readOnly: boolean;
	uploading: boolean;
	onPage: (page: DesignPage) => void;
	onBackground: (background: CertificateDesignV2["background"]) => void;
	/** Quita formas y logos, para que se vea el diseño del PDF. */
	onRemoveDecoration: () => void;
	onUploadPdf: (file: File) => void;
}

const mm = (pt: number) => Math.round((pt / 72) * 25.4);

/** Tamaño y orientación de la página, y su fondo: un color o un PDF. */
export function PagePanel({
	design,
	documentColors,
	readOnly,
	uploading,
	onPage,
	onBackground,
	onRemoveDecoration,
	onUploadPdf,
}: PagePanelProps) {
	const input = useRef<HTMLInputElement>(null);
	const { page, background } = design;
	const pdf = background.kind === "pdf";

	return (
		<div className="flex flex-col">
			<PropertySection title="Página">
				<PropertyRow label="Tamaño">
					<Select
						value={page.preset}
						disabled={readOnly || pdf}
						onValueChange={(preset) =>
							onPage(pageOf(preset as "A4" | "LETTER", page.orientation))
						}
					>
						<SelectTrigger
							className="h-8 w-full text-xs"
							aria-label="Tamaño de página"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(Object.keys(PAGE_PRESETS) as (keyof typeof PAGE_PRESETS)[]).map(
								(preset) => (
									<SelectItem key={preset} value={preset}>
										{PAGE_PRESETS[preset].label}
									</SelectItem>
								),
							)}
							{page.preset === "CUSTOM" && (
								<SelectItem value="CUSTOM" disabled>
									Del PDF de fondo
								</SelectItem>
							)}
						</SelectContent>
					</Select>
				</PropertyRow>
				<SegmentedControl
					label="Orientación"
					value={page.orientation}
					disabled={readOnly || pdf || page.preset === "CUSTOM"}
					onChange={(orientation) => {
						if (page.preset !== "CUSTOM")
							onPage(pageOf(page.preset, orientation));
					}}
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
					{mm(page.widthPt)} × {mm(page.heightPt)} mm. Al cambiarla, los
					elementos se reacomodan en proporción; revisa el resultado.
				</p>
			</PropertySection>

			<PropertySection title="Fondo">
				{pdf ? (
					<>
						<p className="text-muted-foreground text-xs">
							El certificado usa un PDF de fondo. El PDF descargado conserva su
							calidad vectorial; la página mide lo mismo que el PDF.
						</p>
						{hasDecoration(design) && (
							<Button
								variant="outline"
								size="sm"
								disabled={readOnly}
								onClick={onRemoveDecoration}
							>
								<Eraser aria-hidden="true" />
								Quitar formas y logos
							</Button>
						)}
						<Button
							variant="outline"
							size="sm"
							disabled={readOnly}
							onClick={() =>
								onBackground({ kind: "color", color: BACKGROUND_DEFAULT_COLOR })
							}
						>
							<X aria-hidden="true" />
							Quitar el PDF de fondo
						</Button>
					</>
				) : (
					<PropertyRow label="Color">
						<ColorField
							label="Color de fondo"
							value={background.color}
							documentColors={documentColors}
							disabled={readOnly}
							onChange={(color) =>
								color && onBackground({ kind: "color", color })
							}
						/>
					</PropertyRow>
				)}
				<Button
					variant={pdf ? "ghost" : "outline"}
					size="sm"
					disabled={readOnly}
					pending={uploading}
					onClick={() => input.current?.click()}
				>
					<FileUp aria-hidden="true" />
					{pdf ? "Cambiar el PDF de fondo" : "Usar un PDF como fondo"}
				</Button>
				<p className="text-muted-foreground text-xs">
					Se usa la primera página, de hasta 10 MB, sin contraseña. Se guarda
					sin enlaces, formularios ni código.
				</p>
				<input
					ref={input}
					type="file"
					accept="application/pdf"
					className="sr-only"
					tabIndex={-1}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (file) onUploadPdf(file);
					}}
				/>
			</PropertySection>
		</div>
	);
}
