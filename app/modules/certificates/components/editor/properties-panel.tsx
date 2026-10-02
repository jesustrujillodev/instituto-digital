import {
	AlignCenterHorizontal,
	AlignCenterVertical,
	AlignEndHorizontal,
	AlignEndVertical,
	AlignHorizontalDistributeCenter,
	AlignStartHorizontal,
	AlignStartVertical,
	AlignVerticalDistributeCenter,
	Copy,
	Eye,
	EyeOff,
	Lock,
	LockOpen,
	MousePointerClick,
	Trash2,
} from "lucide-react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Slider } from "@/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import type { DesignElement } from "../../domain/design/design-v2.schema";
import type { Alignment } from "../../utils/editor/align";
import { isMandatory } from "../../utils/editor/elements";
import { ElementStyleFields } from "./element-style-fields";
import { NumberField, PropertyRow, PropertySection } from "./fields";

export type ElementAction =
	| { type: "delete" }
	| { type: "duplicate" }
	| { type: "align"; alignment: Alignment }
	| { type: "distribute"; axis: "x" | "y" };

interface PropertiesPanelProps {
	selected: readonly DesignElement[];
	documentColors: readonly string[];
	folioFormat: string;
	sampleFolio: string;
	readOnly: boolean;
	onPatch: (id: string, patch: Partial<DesignElement>, field: string) => void;
	onFolioFormat: (format: string) => void;
	onSeal: () => void;
	onAction: (action: ElementAction) => void;
}

const TYPE_LABELS: Record<DesignElement["type"], string> = {
	text: "Texto",
	folio: "Folio",
	shape: "Forma",
	image: "Imagen",
	qr: "QR de verificación",
};

const ALIGNMENTS: {
	alignment: Alignment;
	label: string;
	icon: typeof AlignStartVertical;
}[] = [
	{
		alignment: "left",
		label: "Alinear a la izquierda",
		icon: AlignStartVertical,
	},
	{
		alignment: "center-x",
		label: "Centrar en horizontal",
		icon: AlignCenterVertical,
	},
	{ alignment: "right", label: "Alinear a la derecha", icon: AlignEndVertical },
	{ alignment: "top", label: "Alinear arriba", icon: AlignStartHorizontal },
	{
		alignment: "center-y",
		label: "Centrar en vertical",
		icon: AlignCenterHorizontal,
	},
	{ alignment: "bottom", label: "Alinear abajo", icon: AlignEndHorizontal },
];

function IconAction({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function AlignTools({
	count,
	readOnly,
	onAction,
}: {
	count: number;
	readOnly: boolean;
	onAction: PropertiesPanelProps["onAction"];
}) {
	return (
		<PropertySection
			title={count > 1 ? "Alinear selección" : "Alinear a la página"}
		>
			<div className="grid grid-cols-6 gap-1">
				{ALIGNMENTS.map(({ alignment, label, icon: Icon }) => (
					<IconAction
						key={alignment}
						label={label}
						disabled={readOnly}
						onClick={() => onAction({ type: "align", alignment })}
					>
						<Icon aria-hidden="true" />
					</IconAction>
				))}
			</div>
			{count > 2 && (
				<div className="grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={readOnly}
						onClick={() => onAction({ type: "distribute", axis: "x" })}
					>
						<AlignHorizontalDistributeCenter aria-hidden="true" />
						Repartir
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={readOnly}
						onClick={() => onAction({ type: "distribute", axis: "y" })}
					>
						<AlignVerticalDistributeCenter aria-hidden="true" />
						Repartir
					</Button>
				</div>
			)}
		</PropertySection>
	);
}

/** Propiedades de lo seleccionado: geometría, estilo y acciones. */
export function PropertiesPanel({
	selected,
	documentColors,
	folioFormat,
	sampleFolio,
	readOnly,
	onPatch,
	onFolioFormat,
	onSeal,
	onAction,
}: PropertiesPanelProps) {
	if (selected.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted-foreground text-sm">
				<MousePointerClick className="size-6" aria-hidden="true" />
				<p>Selecciona un elemento del lienzo o de las capas para editarlo.</p>
				<p className="text-xs">
					Doble clic en un texto para escribir sobre el lienzo. Shift para
					seleccionar varios; Alt al arrastrar para soltar sin guías.
				</p>
			</div>
		);
	}

	if (selected.length > 1) {
		const removable = selected.some((element) => !isMandatory(element));
		return (
			<div className="flex flex-col">
				<PropertySection
					title={`${selected.length} elementos`}
					action={
						<div className="flex">
							<IconAction
								label="Duplicar"
								disabled={readOnly || !removable}
								onClick={() => onAction({ type: "duplicate" })}
							>
								<Copy aria-hidden="true" />
							</IconAction>
							<IconAction
								label="Eliminar"
								disabled={readOnly || !removable}
								onClick={() => onAction({ type: "delete" })}
							>
								<Trash2 aria-hidden="true" />
							</IconAction>
						</div>
					}
				>
					<p className="text-muted-foreground text-xs">
						Arrástralos juntos o escálalos desde una esquina. El QR y el folio
						no se duplican ni se eliminan.
					</p>
				</PropertySection>
				<AlignTools
					count={selected.length}
					readOnly={readOnly}
					onAction={onAction}
				/>
			</div>
		);
	}

	const [element] = selected;
	const mandatory = isMandatory(element);
	const patch = (value: Partial<DesignElement>, field: string) =>
		onPatch(element.id, value, field);
	const disabled = readOnly || element.locked;

	return (
		<div className="flex flex-col">
			<PropertySection
				title={TYPE_LABELS[element.type]}
				action={
					<div className="flex">
						<IconAction
							label={element.locked ? "Desbloquear" : "Bloquear"}
							disabled={readOnly}
							onClick={() => patch({ locked: !element.locked }, "locked")}
						>
							{element.locked ? (
								<Lock aria-hidden="true" />
							) : (
								<LockOpen aria-hidden="true" />
							)}
						</IconAction>
						<IconAction
							label={element.hidden ? "Mostrar" : "Ocultar"}
							disabled={readOnly || mandatory}
							onClick={() => patch({ hidden: !element.hidden }, "hidden")}
						>
							{element.hidden ? (
								<EyeOff aria-hidden="true" />
							) : (
								<Eye aria-hidden="true" />
							)}
						</IconAction>
						<IconAction
							label="Duplicar"
							disabled={readOnly || mandatory}
							onClick={() => onAction({ type: "duplicate" })}
						>
							<Copy aria-hidden="true" />
						</IconAction>
						<IconAction
							label="Eliminar"
							disabled={readOnly || mandatory}
							onClick={() => onAction({ type: "delete" })}
						>
							<Trash2 aria-hidden="true" />
						</IconAction>
					</div>
				}
			>
				<PropertyRow label="Nombre de la capa">
					<Input
						value={element.name}
						maxLength={60}
						disabled={readOnly}
						className="h-8 text-xs"
						onChange={(event) => patch({ name: event.target.value }, "name")}
						onBlur={onSeal}
					/>
				</PropertyRow>
				{mandatory && (
					<p className="text-muted-foreground text-xs">
						Obligatorio: se puede mover y cambiar de tamaño, pero no ocultar ni
						eliminar.
					</p>
				)}
			</PropertySection>

			<PropertySection title="Posición y tamaño">
				<div className="grid grid-cols-2 gap-2">
					<NumberField
						label="X"
						suffix="pt"
						value={element.x}
						disabled={disabled}
						onChange={(x) => patch({ x }, "x")}
						onCommitEnd={onSeal}
					/>
					<NumberField
						label="Y"
						suffix="pt"
						value={element.y}
						disabled={disabled}
						onChange={(y) => patch({ y }, "y")}
						onCommitEnd={onSeal}
					/>
					<NumberField
						label="Ancho"
						suffix="pt"
						min={element.type === "qr" ? 56.7 : 1}
						value={element.w}
						disabled={disabled}
						onChange={(w) =>
							patch(element.type === "qr" ? { w, h: w } : { w }, "w")
						}
						onCommitEnd={onSeal}
					/>
					<NumberField
						label="Alto"
						suffix="pt"
						min={element.type === "qr" ? 56.7 : 1}
						value={element.h}
						disabled={disabled}
						onChange={(h) =>
							patch(element.type === "qr" ? { w: h, h } : { h }, "h")
						}
						onCommitEnd={onSeal}
					/>
					<NumberField
						label="Giro"
						suffix="°"
						min={-360}
						max={360}
						step={element.type === "qr" ? 90 : 1}
						value={element.rotation}
						disabled={disabled}
						onChange={(rotation) =>
							patch(
								{
									rotation:
										element.type === "qr"
											? Math.round(rotation / 90) * 90
											: rotation,
								},
								"rotation",
							)
						}
						onCommitEnd={onSeal}
					/>
				</div>
				{element.type !== "qr" && (
					<PropertyRow
						label={`Opacidad · ${Math.round(element.opacity * 100)} %`}
					>
						<Slider
							min={0}
							max={100}
							step={1}
							disabled={disabled}
							value={[Math.round(element.opacity * 100)]}
							onValueChange={([value]) =>
								patch({ opacity: value / 100 }, "opacity")
							}
							onValueCommit={onSeal}
							aria-label="Opacidad"
						/>
					</PropertyRow>
				)}
			</PropertySection>

			<ElementStyleFields
				element={element}
				disabled={disabled}
				documentColors={documentColors}
				folioFormat={folioFormat}
				sampleFolio={sampleFolio}
				onPatch={patch}
				onFolioFormat={onFolioFormat}
				onSeal={onSeal}
			/>

			<AlignTools count={1} readOnly={disabled} onAction={onAction} />
		</div>
	);
}
