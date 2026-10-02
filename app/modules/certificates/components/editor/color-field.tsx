import { Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { CERTIFICATE_ACCENTS } from "../../domain/certificate.config";
import { HEX_COLOR } from "../../domain/design/color";

const NEUTRALS = [
	"#ffffff",
	"#f4eef0",
	"#fffdf9",
	"#6b6b6b",
	"#1f1f1f",
	"#000000",
];

interface ColorFieldProps {
	label: string;
	value: string | null;
	onChange: (color: string | null) => void;
	/** Colores que ya usa el documento, para repetirlos sin teclear el hex. */
	documentColors?: readonly string[];
	/** Permite «sin color» (un relleno o un borde que no se pinta). */
	nullable?: boolean;
	disabled?: boolean;
}

/** Un color del diseño: paleta del manual, colores del documento o hex libre. */
export function ColorField({
	label,
	value,
	onChange,
	documentColors = [],
	nullable = false,
	disabled,
}: ColorFieldProps) {
	const [hex, setHex] = useState(value ?? "");
	useEffect(() => setHex(value ?? ""), [value]);

	const swatch = (color: string) => (
		<button
			key={color}
			type="button"
			title={color}
			aria-label={`Usar ${color}`}
			aria-pressed={value?.toLowerCase() === color.toLowerCase()}
			className={cn(
				"size-6 rounded-md border border-foreground/15 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
				value?.toLowerCase() === color.toLowerCase() &&
					"ring-2 ring-ring ring-offset-1 ring-offset-popover",
			)}
			style={{ background: color }}
			onClick={() => onChange(color)}
		/>
	);

	const others = [
		...new Set(documentColors.map((color) => color.toLowerCase())),
	].filter(
		(color) =>
			!(CERTIFICATE_ACCENTS as readonly string[]).includes(color) &&
			!NEUTRALS.includes(color),
	);

	return (
		<Popover>
			<PopoverTrigger asChild disabled={disabled}>
				<button
					type="button"
					className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					aria-label={`${label}: ${value ?? "sin color"}`}
				>
					<span
						className="grid size-5 shrink-0 place-items-center rounded border border-foreground/15"
						style={value ? { background: value } : undefined}
					>
						{!value && (
							<Ban
								className="size-3 text-muted-foreground"
								aria-hidden="true"
							/>
						)}
					</span>
					<span className="truncate font-mono uppercase">
						{value ?? "Sin color"}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-60 gap-3 p-3" align="start">
				<div className="flex flex-col gap-1.5">
					<p className="text-muted-foreground text-xs">Manual de identidad</p>
					<div className="flex flex-wrap gap-1.5">
						{CERTIFICATE_ACCENTS.map(swatch)}
						{NEUTRALS.map(swatch)}
					</div>
				</div>
				{others.length > 0 && (
					<div className="flex flex-col gap-1.5">
						<p className="text-muted-foreground text-xs">En este certificado</p>
						<div className="flex flex-wrap gap-1.5">{others.map(swatch)}</div>
					</div>
				)}
				<div className="flex items-center gap-2">
					<input
						type="color"
						aria-label={`${label}: elegir color`}
						value={value ?? "#000000"}
						onChange={(event) => onChange(event.target.value)}
						className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent"
					/>
					<Input
						aria-label={`${label}: hexadecimal`}
						value={hex}
						maxLength={7}
						className="h-8 font-mono text-xs uppercase"
						onChange={(event) => {
							const next = event.target.value.trim();
							setHex(next);
							if (HEX_COLOR.test(next)) onChange(next.toLowerCase());
						}}
					/>
				</div>
				{nullable && (
					<button
						type="button"
						className="flex items-center gap-2 text-muted-foreground text-xs hover:text-foreground"
						onClick={() => onChange(null)}
					>
						<Ban className="size-3.5" aria-hidden="true" />
						Sin color
					</button>
				)}
			</PopoverContent>
		</Popover>
	);
}
