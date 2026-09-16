import { useCallback, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
	formatThemeColor,
	isThemeColor,
	type OklchColor,
	parseThemeColor,
	themeColorToHex,
} from "../domain/theme.rules";

/**
 * Croma máximo del área.
 *
 * Por encima de ~0.37 casi nada cae dentro del gamut sRGB en la mayoría de
 * tonos, así que el resto del área sería una franja de colores que el monitor no
 * puede enseñar y que el navegador recorta en silencio.
 */
const MAX_CHROMA = 0.37;

/** Franjas verticales del área de croma × luminosidad. */
const CHROMA_STRIPS = 32;

const HUE_STOPS = Array.from(
	{ length: 13 },
	(_, index) => `oklch(0.7 0.16 ${index * 30})`,
).join(", ");

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Fondo del área: una franja vertical por cada valor de croma, cada una con un
 * degradado de luminosidad EN OKLCH.
 *
 * No hay gradientes 2D en CSS, así que hay que trocear un eje. Se trocea el
 * croma y no la luminosidad porque el escalón entre dos franjas contiguas de
 * croma (0.012) es casi imperceptible, mientras que un escalón de luminosidad se
 * ve como una banda. Dentro de cada franja el degradado sí es continuo y exacto:
 * lo interpola el navegador en el mismo espacio de color en el que trabajamos.
 *
 * La alternativa habitual —una capa blanca y otra negra con transparencia sobre
 * el tono puro— compone en sRGB y enseña un color distinto del que promete.
 */
const areaBackground = (hue: number) => {
	const layers: string[] = [];
	const positions: string[] = [];

	for (let index = 0; index < CHROMA_STRIPS; index += 1) {
		const chroma = (index / (CHROMA_STRIPS - 1)) * MAX_CHROMA;
		layers.push(
			`linear-gradient(in oklch to bottom, oklch(1 ${chroma} ${hue}), oklch(0 ${chroma} ${hue}))`,
		);
		positions.push(`${(index / (CHROMA_STRIPS - 1)) * 100}% 0`);
	}

	return {
		backgroundImage: layers.join(", "),
		backgroundPosition: positions.join(", "),
		backgroundSize: `${100 / CHROMA_STRIPS + 0.4}% 100%`,
		backgroundRepeat: "no-repeat",
	};
};

interface ColorFieldProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	/** Ratio de contraste contra su par, si el token tiene uno. */
	hint?: string;
}

/**
 * Campo de color en OKLCH: swatch, área de croma × luminosidad, tono y alfa.
 *
 * Escrito a mano y no con una librería porque ninguna de las conocidas habla
 * OKLCH de forma nativa: todas convierten a HSL o a RGB para pintar sus
 * controles, y el color que se elige deja de ser el que se guarda. El proyecto
 * ya trabaja entero en OKLCH (decisión #13), y las conversiones que hacen falta
 * las hace `culori` dentro de `theme.rules.ts`.
 */
export function ColorField({ label, value, onChange, hint }: ColorFieldProps) {
	const fieldId = useId();
	const errorId = useId();
	const areaRef = useRef<HTMLDivElement>(null);

	/*
	 * Lo que se está escribiendo vive AQUÍ, no en los tokens.
	 *
	 * Antes cada pulsación viajaba al borrador, así que un valor a medio escribir
	 * —`oklch(0.5 0.1 20`, sin cerrar— entraba en el tema y el autoguardado lo
	 * persistía 1,2 s después, sin que el preview lo delatara. Ahora solo sale de
	 * aquí lo que se puede interpretar; el resto se queda en el campo, marcado,
	 * hasta que se termine de escribir.
	 *
	 * El estado local se readopta cuando cambia el valor de FUERA (otro tema, el
	 * picker, "derivar oscuro"), y no cuando cambia por lo que se acaba de teclear.
	 */
	const [draft, setDraft] = useState(value);
	const lastValue = useRef(value);

	if (lastValue.current !== value) {
		lastValue.current = value;
		setDraft(value);
	}

	const isDraftValid = isThemeColor(draft);

	// Un token ilegible no debe romper el editor: se ofrece un punto de partida
	// neutro y el admin puede corregirlo escribiendo encima.
	const color: OklchColor = parseThemeColor(value) ?? {
		l: 0.5,
		c: 0,
		h: 0,
		alpha: 1,
	};

	const patch = useCallback(
		(next: Partial<OklchColor>) =>
			onChange(formatThemeColor({ ...color, ...next })),
		[color, onChange],
	);

	const pickFromArea = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const box = areaRef.current?.getBoundingClientRect();
			if (!box) return;

			patch({
				c: clamp01((event.clientX - box.left) / box.width) * MAX_CHROMA,
				l: 1 - clamp01((event.clientY - box.top) / box.height),
			});
		},
		[patch],
	);

	return (
		<div className="flex items-center gap-2">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label={`Editar ${label}`}
						className="size-8 shrink-0 overflow-hidden p-0"
					>
						<span
							className="block size-full"
							style={{ backgroundColor: value }}
							aria-hidden="true"
						/>
					</Button>
				</PopoverTrigger>

				{/*
				 * El picker vive en un popover y no en línea.
				 *
				 * Inline era una tarjeta dentro de la tarjeta de la sección, y abrirlo
				 * empujaba hacia abajo los treinta y cinco campos siguientes: se perdía
				 * de vista el color de al lado justo cuando se estaba comparando con él.
				 */}
				<PopoverContent align="start" className="flex w-72 flex-col gap-3">
					{/* El área es un atajo con el ratón, no la única vía: el teclado
					    llega a los mismos valores por los sliders y por el campo de
					    texto de fuera, que son controles nativos. */}
					<div
						ref={areaRef}
						role="presentation"
						className="relative h-40 w-full cursor-crosshair rounded-sm border"
						style={areaBackground(color.h)}
						onPointerDown={(event) => {
							event.currentTarget.setPointerCapture(event.pointerId);
							pickFromArea(event);
						}}
						onPointerMove={(event) => {
							if (event.buttons === 1) pickFromArea(event);
						}}
					>
						<span
							className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ring-1 ring-black/40"
							style={{
								left: `${(color.c / MAX_CHROMA) * 100}%`,
								top: `${(1 - color.l) * 100}%`,
							}}
						/>
					</div>

					<Slider
						label="Tono"
						min={0}
						max={360}
						step={1}
						value={color.h}
						onChange={(h) => patch({ h })}
						trackStyle={{
							backgroundImage: `linear-gradient(to right, ${HUE_STOPS})`,
						}}
					/>

					<Slider
						label="Opacidad"
						min={0}
						max={1}
						step={0.01}
						value={color.alpha}
						onChange={(alpha) => patch({ alpha })}
						trackStyle={{
							backgroundImage: `linear-gradient(to right, transparent, ${formatThemeColor({ ...color, alpha: 1 })})`,
						}}
					/>

					<div className="flex items-center gap-2">
						<input
							type="color"
							aria-label={`${label} en hexadecimal`}
							value={themeColorToHex(value)}
							onChange={(event) => {
								const picked = parseThemeColor(event.target.value);
								// El picker nativo no habla de alfa: se conserva el que había
								// en vez de dejarlo opaco por sorpresa.
								if (picked) patch({ ...picked, alpha: color.alpha });
							}}
							className="h-8 w-12 cursor-pointer rounded border bg-transparent"
						/>
						<p className="text-xs text-muted-foreground">
							El selector del sistema trabaja en sRGB. El valor se guarda en
							OKLCH.
						</p>
					</div>
				</PopoverContent>
			</Popover>

			<div className="min-w-0 flex-1">
				<label
					htmlFor={fieldId}
					className="flex items-baseline gap-1 truncate text-xs"
				>
					{/* El nombre se queda en mono porque ES la variable CSS: es lo que
					    hay que buscar en el bloque que se pega desde tweakcn. */}
					<span className="truncate font-mono text-muted-foreground">
						{label}
					</span>
					{hint && (
						<span className="shrink-0 tabular-nums text-muted-foreground">
							{hint}
						</span>
					)}
				</label>
				<Input
					id={fieldId}
					value={draft}
					onChange={(event) => {
						const next = event.target.value;
						setDraft(next);
						if (isThemeColor(next)) onChange(next);
					}}
					aria-invalid={!isDraftValid}
					aria-describedby={isDraftValid ? undefined : errorId}
					className="h-7 font-mono text-xs"
					spellCheck={false}
				/>
				{!isDraftValid && (
					<p id={errorId} className="mt-1 text-xs text-destructive">
						Sin interpretar: se mantiene el color anterior.
					</p>
				)}
			</div>
		</div>
	);
}

interface SliderProps {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (value: number) => void;
	trackStyle?: React.CSSProperties;
}

/**
 * Slider con la pista teñida por el degradado que representa.
 *
 * Es un `<input type="range">` nativo a propósito: llega con navegación por
 * teclado, soporte de lector de pantalla y arrastre correcto en táctil sin que
 * haya que reimplementar nada de eso.
 */
function Slider({
	label,
	min,
	max,
	step,
	value,
	onChange,
	trackStyle,
	className,
}: SliderProps & { className?: string }) {
	const id = useId();

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<div className="flex items-center justify-between">
				<label htmlFor={id} className="text-xs text-muted-foreground">
					{label}
				</label>
				<span className="font-mono text-xs tabular-nums">{value}</span>
			</div>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				style={trackStyle}
				className="h-4 w-full cursor-pointer appearance-none rounded-full border bg-muted accent-primary"
			/>
		</div>
	);
}

export { Slider as RangeField };
