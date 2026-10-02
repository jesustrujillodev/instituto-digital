import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	ArrowDownToLine,
	ArrowUpToLine,
	FoldVertical,
	Plus,
} from "lucide-react";
import { useId } from "react";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Switch } from "@/ui/switch";
import { Textarea } from "@/ui/textarea";
import {
	DESIGN_TOKEN_LABELS,
	DESIGN_TOKENS,
	type DesignToken,
} from "../../domain/design/design.tokens";
import type {
	DesignElement,
	FolioElement,
	TextElement,
} from "../../domain/design/design-v2.schema";
import {
	FONT_CATALOG,
	FONT_IDS,
	type FontId,
	findFace,
} from "../../domain/design/font-catalog";
import { fontStackOf } from "../../domain/design/render-v2";
import { grownTextHeight } from "../../utils/editor/page";
import { ColorField } from "./color-field";
import {
	NumberField,
	PropertyRow,
	PropertySection,
	SegmentedControl,
} from "./fields";

const WEIGHT_LABELS: Record<number, string> = {
	200: "Extra fina",
	400: "Normal",
	500: "Media",
	600: "Seminegrita",
	700: "Negrita",
};

interface ElementStyleFieldsProps {
	element: DesignElement;
	disabled: boolean;
	documentColors: readonly string[];
	folioFormat: string;
	sampleFolio: string;
	onPatch: (value: Partial<DesignElement>, field: string) => void;
	onFolioFormat: (format: string) => void;
	onSeal: () => void;
}

function TypographyFields({
	element,
	disabled,
	documentColors,
	onPatch,
	onSeal,
}: {
	element: TextElement | FolioElement;
	disabled: boolean;
	documentColors: readonly string[];
	onPatch: ElementStyleFieldsProps["onPatch"];
	onSeal: () => void;
}) {
	const switchId = useId();
	const family = FONT_CATALOG[element.fontId];
	const weights = [...new Set(family.faces.map((face) => face.weight))];
	const hasItalic =
		findFace(element.fontId, element.weight, true) !== undefined;

	const setFont = (fontId: FontId) => {
		const faces = FONT_CATALOG[fontId].faces;
		const weight = faces.some((face) => face.weight === element.weight)
			? element.weight
			: faces[0].weight;
		const italic =
			element.italic && findFace(fontId, weight, true) !== undefined;
		onPatch({ fontId, weight, italic }, "font");
		onSeal();
	};

	return (
		<PropertySection title="Tipografía">
			<PropertyRow label="Fuente">
				<Select
					value={element.fontId}
					onValueChange={(value) => setFont(value as FontId)}
					disabled={disabled}
				>
					<SelectTrigger className="h-8 w-full text-xs" aria-label="Fuente">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{FONT_IDS.map((id) => (
							<SelectItem
								key={id}
								value={id}
								style={{ fontFamily: fontStackOf(id) }}
							>
								{FONT_CATALOG[id].label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PropertyRow>
			<div className="grid grid-cols-2 gap-2">
				<PropertyRow label="Grosor">
					<Select
						value={String(element.weight)}
						disabled={disabled || weights.length < 2}
						onValueChange={(value) => {
							const weight = Number(value);
							onPatch(
								{
									weight,
									italic:
										element.italic &&
										findFace(element.fontId, weight, true) !== undefined,
								},
								"weight",
							);
							onSeal();
						}}
					>
						<SelectTrigger className="h-8 w-full text-xs" aria-label="Grosor">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{weights.map((weight) => (
								<SelectItem key={weight} value={String(weight)}>
									{WEIGHT_LABELS[weight] ?? weight}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</PropertyRow>
				<NumberField
					label="Tamaño"
					suffix="pt"
					min={4}
					max={200}
					step={0.5}
					value={element.sizePt}
					disabled={disabled}
					onChange={(sizePt) => onPatch({ sizePt }, "sizePt")}
					onCommitEnd={onSeal}
				/>
			</div>
			<PropertyRow label="Color">
				<ColorField
					label="Color del texto"
					value={element.color}
					documentColors={documentColors}
					disabled={disabled}
					onChange={(color) => {
						if (color) onPatch({ color }, "color");
						onSeal();
					}}
				/>
			</PropertyRow>
			<SegmentedControl
				label="Alineación"
				value={element.align}
				disabled={disabled}
				onChange={(align) => {
					onPatch({ align }, "align");
					onSeal();
				}}
				options={[
					{
						value: "left",
						label: "Izquierda",
						icon: <AlignLeft className="size-3.5" />,
					},
					{
						value: "center",
						label: "Centro",
						icon: <AlignCenter className="size-3.5" />,
					},
					{
						value: "right",
						label: "Derecha",
						icon: <AlignRight className="size-3.5" />,
					},
					...(element.type === "text"
						? [
								{
									value: "justify" as const,
									label: "Justificado",
									icon: <AlignJustify className="size-3.5" />,
								},
							]
						: []),
				]}
			/>
			<div className="grid grid-cols-2 gap-2">
				<NumberField
					label="Espaciado"
					suffix="em"
					min={-0.1}
					max={1}
					step={0.01}
					value={element.letterSpacing}
					disabled={disabled}
					onChange={(letterSpacing) =>
						onPatch({ letterSpacing }, "letterSpacing")
					}
					onCommitEnd={onSeal}
				/>
				{element.type === "text" && (
					<NumberField
						label="Interlineado"
						min={0.8}
						max={3}
						step={0.05}
						value={element.lineHeight}
						disabled={disabled}
						onChange={(lineHeight) => onPatch({ lineHeight }, "lineHeight")}
						onCommitEnd={onSeal}
					/>
				)}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-2">
				<div className="flex items-center gap-2">
					<Switch
						id={`${switchId}-upper`}
						checked={element.uppercase}
						disabled={disabled}
						onCheckedChange={(uppercase) => {
							onPatch({ uppercase }, "uppercase");
							onSeal();
						}}
					/>
					<Label htmlFor={`${switchId}-upper`} className="text-xs">
						Mayúsculas
					</Label>
				</div>
				<div className="flex items-center gap-2">
					<Switch
						id={`${switchId}-italic`}
						checked={element.italic}
						disabled={disabled || !hasItalic}
						onCheckedChange={(italic) => {
							onPatch({ italic }, "italic");
							onSeal();
						}}
					/>
					<Label htmlFor={`${switchId}-italic`} className="text-xs">
						Cursiva
					</Label>
				</div>
			</div>
		</PropertySection>
	);
}

function TextContentFields({
	element,
	disabled,
	onPatch,
	onSeal,
}: {
	element: TextElement;
	disabled: boolean;
	onPatch: ElementStyleFieldsProps["onPatch"];
	onSeal: () => void;
}) {
	const id = useId();
	const setContent = (content: string) =>
		onPatch(
			{ content, h: grownTextHeight({ ...element, content }) },
			"content",
		);

	return (
		<PropertySection
			title="Contenido"
			action={
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="xs" disabled={disabled}>
							<Plus aria-hidden="true" />
							Campo
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{(Object.keys(DESIGN_TOKENS) as DesignToken[]).map((token) => (
							<DropdownMenuItem
								key={token}
								onSelect={() => {
									setContent(`${element.content}{${token}}`);
									onSeal();
								}}
							>
								{DESIGN_TOKEN_LABELS[token]}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			}
		>
			<PropertyRow label="Texto" htmlFor={id}>
				<Textarea
					id={id}
					value={element.content}
					rows={3}
					maxLength={1000}
					disabled={disabled}
					className="text-xs"
					onChange={(event) => setContent(event.target.value)}
					onBlur={onSeal}
				/>
			</PropertyRow>
			<p className="text-muted-foreground text-xs">
				Los campos entre llaves se llenan al emitir. Si uno queda vacío (por
				ejemplo, sin horas), el texto no se imprime.
			</p>
			<SegmentedControl
				label="Si no cabe"
				value={element.fit}
				disabled={disabled}
				onChange={(fit) => {
					onPatch({ fit }, "fit");
					onSeal();
				}}
				options={[
					{ value: "shrink", label: "Reducir letra" },
					{ value: "wrap", label: "Crecer caja" },
				]}
			/>
			{element.fit === "shrink" && (
				<NumberField
					label="Tamaño mínimo"
					suffix="pt"
					min={4}
					max={element.sizePt}
					step={0.5}
					value={element.minSizePt}
					disabled={disabled}
					onChange={(minSizePt) => onPatch({ minSizePt }, "minSizePt")}
					onCommitEnd={onSeal}
				/>
			)}
			<SegmentedControl
				label="Alineación vertical"
				value={element.vAlign}
				disabled={disabled}
				onChange={(vAlign) => {
					onPatch({ vAlign }, "vAlign");
					onSeal();
				}}
				options={[
					{
						value: "top",
						label: "Arriba",
						icon: <ArrowUpToLine className="size-3.5" />,
					},
					{
						value: "middle",
						label: "Centro",
						icon: <FoldVertical className="size-3.5" />,
					},
					{
						value: "bottom",
						label: "Abajo",
						icon: <ArrowDownToLine className="size-3.5" />,
					},
				]}
			/>
		</PropertySection>
	);
}

/** Lo propio de cada tipo de elemento. */
export function ElementStyleFields({
	element,
	disabled,
	documentColors,
	folioFormat,
	sampleFolio,
	onPatch,
	onFolioFormat,
	onSeal,
}: ElementStyleFieldsProps) {
	const formatId = useId();

	switch (element.type) {
		case "text":
			return (
				<>
					<TextContentFields
						element={element}
						disabled={disabled}
						onPatch={onPatch}
						onSeal={onSeal}
					/>
					<TypographyFields
						element={element}
						disabled={disabled}
						documentColors={documentColors}
						onPatch={onPatch}
						onSeal={onSeal}
					/>
				</>
			);
		case "folio":
			return (
				<>
					<PropertySection title="Folio">
						<PropertyRow label="Formato" htmlFor={formatId}>
							<Input
								id={formatId}
								value={folioFormat}
								maxLength={40}
								disabled={disabled}
								className="h-8 font-mono text-xs"
								aria-invalid={!folioFormat.includes("{seq}") || undefined}
								onChange={(event) => onFolioFormat(event.target.value)}
								onBlur={onSeal}
							/>
						</PropertyRow>
						<p className="text-muted-foreground text-xs">
							Usa {"{seq}"} (obligatorio), {"{year}"} y {"{month}"}. Ejemplo:{" "}
							<span className="font-mono text-foreground">{sampleFolio}</span>
						</p>
						<PropertyRow label="Texto antes del folio">
							<Input
								value={element.label}
								maxLength={40}
								disabled={disabled}
								placeholder="Por ejemplo, «Folio: »"
								className="h-8 text-xs"
								onChange={(event) =>
									onPatch({ label: event.target.value }, "label")
								}
								onBlur={onSeal}
							/>
						</PropertyRow>
					</PropertySection>
					<TypographyFields
						element={element}
						disabled={disabled}
						documentColors={documentColors}
						onPatch={onPatch}
						onSeal={onSeal}
					/>
				</>
			);
		case "shape":
			return (
				<PropertySection title="Relleno y borde">
					{element.kind !== "line" && (
						<PropertyRow label="Relleno">
							<ColorField
								label="Relleno"
								value={element.fill}
								nullable
								documentColors={documentColors}
								disabled={disabled}
								onChange={(fill) => {
									onPatch({ fill }, "fill");
									onSeal();
								}}
							/>
						</PropertyRow>
					)}
					<PropertyRow label={element.kind === "line" ? "Color" : "Borde"}>
						<ColorField
							label="Borde"
							value={element.stroke}
							nullable={element.kind !== "line"}
							documentColors={documentColors}
							disabled={disabled}
							onChange={(stroke) => {
								onPatch(
									{
										stroke,
										strokeWidth:
											stroke && element.strokeWidth === 0
												? 1
												: element.strokeWidth,
									},
									"stroke",
								);
								onSeal();
							}}
						/>
					</PropertyRow>
					<div className="grid grid-cols-2 gap-2">
						<NumberField
							label="Grosor"
							suffix="pt"
							min={0}
							max={50}
							step={0.25}
							value={element.strokeWidth}
							disabled={disabled}
							onChange={(strokeWidth) =>
								onPatch({ strokeWidth }, "strokeWidth")
							}
							onCommitEnd={onSeal}
						/>
						{element.kind === "rect" && (
							<NumberField
								label="Esquinas"
								suffix="pt"
								min={0}
								max={500}
								value={element.cornerRadius}
								disabled={disabled}
								onChange={(cornerRadius) =>
									onPatch({ cornerRadius }, "cornerRadius")
								}
								onCommitEnd={onSeal}
							/>
						)}
					</div>
				</PropertySection>
			);
		case "image":
			return (
				<PropertySection
					title={
						element.src.kind === "asset" && element.src.role === "signature"
							? "Firma"
							: "Imagen"
					}
				>
					<SegmentedControl
						label="Ajuste"
						value={element.fit}
						disabled={disabled}
						onChange={(fit) => {
							onPatch({ fit }, "fit");
							onSeal();
						}}
						options={[
							{ value: "contain", label: "Completa" },
							{ value: "cover", label: "Rellenar" },
						]}
					/>
				</PropertySection>
			);
		case "qr":
			return (
				<PropertySection title="Código">
					<PropertyRow label="Color">
						<ColorField
							label="Color del QR"
							value={element.color}
							documentColors={documentColors}
							disabled={disabled}
							onChange={(color) => {
								if (color) onPatch({ color }, "color");
								onSeal();
							}}
						/>
					</PropertyRow>
					<p className="text-muted-foreground text-xs">
						Lleva a la verificación pública del certificado. Usa un color oscuro
						para que se lea: el fondo del código siempre es blanco.
					</p>
				</PropertySection>
			);
	}
}
