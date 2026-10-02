import {
	Circle,
	ImagePlus,
	Minus,
	PenLine,
	Square,
	Type,
	Variable,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@/ui/button";
import type { LogoOption } from "../../domain/certificate.types";
import {
	DESIGN_TOKEN_LABELS,
	DESIGN_TOKENS,
	type DesignToken,
} from "../../domain/design/design.tokens";
import type { ShapeElement } from "../../domain/design/design-v2.schema";
import { PropertySection } from "./fields";

export type InsertRequest =
	| { kind: "text" }
	| { kind: "field"; token: DesignToken }
	| { kind: "shape"; shape: ShapeElement["kind"] }
	| { kind: "logo"; logo: LogoOption };

interface InsertPanelProps {
	logos: readonly LogoOption[];
	uploading: boolean;
	disabled: boolean;
	onInsert: (request: InsertRequest) => void;
	onUpload: (file: File, signature: boolean) => void;
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

function Tile({
	label,
	icon: Icon,
	onClick,
	disabled,
}: {
	label: string;
	icon: typeof Type;
	onClick: () => void;
	disabled: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className="flex flex-col items-center gap-1.5 rounded-md border bg-background px-2 py-3 text-xs outline-none transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
		>
			<Icon className="size-5 text-muted-foreground" aria-hidden="true" />
			{label}
		</button>
	);
}

/** Lo que se puede añadir al certificado. Todo entra centrado en la página. */
export function InsertPanel({
	logos,
	uploading,
	disabled,
	onInsert,
	onUpload,
}: InsertPanelProps) {
	const imageInput = useRef<HTMLInputElement>(null);
	const signatureInput = useRef<HTMLInputElement>(null);
	const available = logos.filter((logo) => !logo.archived);

	const picker = (signature: boolean) => (
		<input
			ref={signature ? signatureInput : imageInput}
			type="file"
			accept={signature ? "image/png,image/webp" : IMAGE_ACCEPT}
			className="sr-only"
			tabIndex={-1}
			onChange={(event) => {
				const file = event.target.files?.[0];
				event.target.value = "";
				if (file) onUpload(file, signature);
			}}
		/>
	);

	return (
		<div className="flex flex-col">
			<PropertySection title="Texto y formas">
				<div className="grid grid-cols-3 gap-2">
					<Tile
						label="Texto"
						icon={Type}
						disabled={disabled}
						onClick={() => onInsert({ kind: "text" })}
					/>
					<Tile
						label="Rectángulo"
						icon={Square}
						disabled={disabled}
						onClick={() => onInsert({ kind: "shape", shape: "rect" })}
					/>
					<Tile
						label="Elipse"
						icon={Circle}
						disabled={disabled}
						onClick={() => onInsert({ kind: "shape", shape: "ellipse" })}
					/>
					<Tile
						label="Línea"
						icon={Minus}
						disabled={disabled}
						onClick={() => onInsert({ kind: "shape", shape: "line" })}
					/>
				</div>
			</PropertySection>

			<PropertySection title="Campos dinámicos">
				<p className="text-muted-foreground text-xs">
					Se llenan con los datos de cada persona al emitir el certificado.
				</p>
				<div className="flex flex-col gap-1">
					{(Object.keys(DESIGN_TOKENS) as DesignToken[])
						.filter((token) => token !== "folio")
						.map((token) => (
							<Button
								key={token}
								variant="ghost"
								size="sm"
								disabled={disabled}
								className="justify-start"
								onClick={() => onInsert({ kind: "field", token })}
							>
								<Variable aria-hidden="true" />
								{DESIGN_TOKEN_LABELS[token]}
							</Button>
						))}
				</div>
			</PropertySection>

			<PropertySection title="Imágenes">
				<div className="grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						pending={uploading}
						onClick={() => imageInput.current?.click()}
					>
						<ImagePlus aria-hidden="true" />
						Imagen
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={disabled || uploading}
						onClick={() => signatureInput.current?.click()}
					>
						<PenLine aria-hidden="true" />
						Firma
					</Button>
				</div>
				<p className="text-muted-foreground text-xs">
					PNG, JPG, WEBP o SVG de hasta 2 MB. La firma, en PNG con fondo
					transparente. Quedan privadas de esta capacitación.
				</p>
				{picker(false)}
				{picker(true)}
			</PropertySection>

			<PropertySection title="Logos institucionales">
				<div className="grid grid-cols-2 gap-2">
					{available.map((logo) => (
						<button
							key={logo.id}
							type="button"
							disabled={disabled}
							title={logo.name}
							onClick={() => onInsert({ kind: "logo", logo })}
							className="flex h-16 items-center justify-center rounded-md border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px] p-2 outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
						>
							<img
								src={logo.url}
								alt={logo.name}
								className="max-h-full max-w-full object-contain"
							/>
						</button>
					))}
				</div>
			</PropertySection>
		</div>
	);
}
