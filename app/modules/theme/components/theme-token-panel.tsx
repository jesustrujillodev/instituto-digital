import { CircleAlert, Moon, Sun, WandSparkles } from "lucide-react";
import { useId, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { FONT_CATALOG } from "../domain/theme.config";
import {
	CONTRAST_PAIRS,
	type ColorTokenName,
	contrastLevel,
	contrastRatio,
	evaluateDensity,
	FONT_FAMILY_KEYS,
	type FontFamilyKey,
	LENGTH_RANGES,
	type LengthTokenName,
	type ThemeShadowTokens,
	type ThemeSharedTokens,
	type ThemeTokens,
	type ThemeVariantName,
} from "../domain/theme.rules";
import { ColorField, RangeField } from "./color-field";
import { ThemeSection } from "./theme-section";

interface ColorGroup {
	label: string;
	tokens: readonly ColorTokenName[];
}

/**
 * Los veinte colores que definen el tema.
 *
 * El orden es el del trabajo real: primero el fondo y el texto, después la
 * marca, y al final los estados. Quien abre esta pantalla viene a cambiar el
 * color de su agencia, no a afinar la quinta serie de una gráfica.
 */
const ESSENTIAL_GROUPS: readonly ColorGroup[] = [
	{
		label: "Superficies",
		tokens: [
			"background",
			"foreground",
			"card",
			"card-foreground",
			"popover",
			"popover-foreground",
		],
	},
	{
		label: "Marca",
		tokens: [
			"primary",
			"primary-foreground",
			"secondary",
			"secondary-foreground",
			"accent",
			"accent-foreground",
			"muted",
			"muted-foreground",
		],
	},
	{
		label: "Estado",
		tokens: [
			"destructive",
			"destructive-foreground",
			"success",
			"success-foreground",
			"warning",
			"warning-foreground",
		],
	},
];

/**
 * Los dieciséis que casi nadie toca.
 *
 * Siguen enteros y editables, pero un grupo plegado por debajo: al mismo nivel
 * que "Marca" hacían que la sección de colores midiera dos pantallas y que lo
 * importante se buscara con scroll.
 */
const ADVANCED_GROUPS: readonly ColorGroup[] = [
	{ label: "Bordes y foco", tokens: ["border", "input", "ring"] },
	{
		label: "Gráficas",
		tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"],
	},
	{
		label: "Barra lateral",
		tokens: [
			"sidebar",
			"sidebar-foreground",
			"sidebar-primary",
			"sidebar-primary-foreground",
			"sidebar-accent",
			"sidebar-accent-foreground",
			"sidebar-border",
			"sidebar-ring",
		],
	},
];

/**
 * Token de texto de cada fondo, para poder enseñar su ratio junto al campo.
 *
 * Un mismo fondo entra en varios pares —`background` mide el texto principal, el
 * secundario, los enlaces y el botón destructivo—: junto al campo se enseña el
 * primero, que es el que define la superficie. El informe completo está en la
 * sección de contraste.
 */
const PAIR_OF = new Map<ColorTokenName, ColorTokenName>();
for (const pair of CONTRAST_PAIRS) {
	if (pair.usage === "text" && !PAIR_OF.has(pair.background)) {
		PAIR_OF.set(pair.background, pair.foreground);
	}
}

function ColorGroupFields({
	group,
	colors,
	variant,
	onColorChange,
}: {
	group: ColorGroup;
	colors: Record<ColorTokenName, string>;
	variant: ThemeVariantName;
	onColorChange: (
		variant: ThemeVariantName,
		token: ColorTokenName,
		value: string,
	) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{group.label}
			</p>
			<div className="grid gap-2 sm:grid-cols-2">
				{group.tokens.map((token) => {
					const pair = PAIR_OF.get(token);
					const ratio = pair
						? contrastRatio(colors[token], colors[pair])
						: null;

					return (
						<ColorField
							key={token}
							label={token}
							value={colors[token]}
							hint={
								ratio === null
									? undefined
									: `· ${ratio}:1 ${contrastLevel(ratio)}`
							}
							onChange={(value) => onColorChange(variant, token, value)}
						/>
					);
				})}
			</div>
		</div>
	);
}

/**
 * Slider sobre una medida CSS (`0.625rem`), con su unidad fija.
 *
 * El rango sale de `LENGTH_RANGES` y no de las props: es el mismo que aplica el
 * validador del servidor y el que recorta el importador de CSS. Cuando vivía
 * aquí suelto, el slider del grosor de borde llegaba a 4 px y el validador
 * aceptaba 8.
 */
function LengthField({
	label,
	token,
	value,
	hint,
	onChange,
}: {
	label: string;
	token: LengthTokenName;
	value: string;
	/** Qué arrastra esta medida. Una línea, no un párrafo debajo del control. */
	hint?: string;
	onChange: (value: string) => void;
}) {
	const { unit, min, max, step } = LENGTH_RANGES[token];
	const amount = Number.parseFloat(value);

	return (
		<div className="flex flex-col gap-1">
			<RangeField
				label={`${label} (${Number.isFinite(amount) ? amount : 0}${unit})`}
				min={min}
				max={max}
				step={step}
				value={Number.isFinite(amount) ? amount : min}
				onChange={(next) => onChange(`${next}${unit}`)}
			/>
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}

function FontSelect({
	label,
	hint,
	value,
	onChange,
	only,
}: {
	label: string;
	/** Dónde aterriza esta familia. Sin esto, cuatro selectores sin destino. */
	hint: string;
	value: FontFamilyKey;
	onChange: (value: FontFamilyKey) => void;
	only?: FontFamilyDefinitionCategory;
}) {
	const id = useId();
	/*
	 * El filtro por categoría es una guía, no una regla: `key === value` mantiene
	 * en la lista la fuente que el tema YA tiene aunque sea de otra categoría.
	 * Sin eso, un tema importado que pone Courier New como `--font-sans` —los hay—
	 * dejaría el desplegable en blanco: el tema pinta con una fuente que la interfaz
	 * de edición no sabe nombrar, y recuperarla tras tocar el campo es imposible.
	 */
	const options = FONT_FAMILY_KEYS.filter(
		(key) =>
			!only ||
			key === "system" ||
			key === value ||
			FONT_CATALOG[key].category === only,
	);

	return (
		<div className="flex flex-col gap-1">
			{/* La pista va sin `opacity`: es el mismo texto secundario que el panel de
			    contraste mide, y bajarle el alfa lo sacaría de su propio mínimo. */}
			<Label htmlFor={id} className="text-xs text-muted-foreground">
				<span className="font-medium text-foreground">{label}</span> · {hint}
			</Label>
			<Select
				value={value}
				onValueChange={(next) => onChange(next as FontFamilyKey)}
			>
				<SelectTrigger id={id} className="h-8">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((key) => (
						<SelectItem key={key} value={key}>
							<span style={{ fontFamily: FONT_CATALOG[key].stack }}>
								{FONT_CATALOG[key].label}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

type FontFamilyDefinitionCategory = "sans" | "serif" | "mono";

interface ThemeTokenPanelProps {
	tokens: ThemeTokens;
	variant: ThemeVariantName;
	onVariantChange: (variant: ThemeVariantName) => void;
	onColorChange: (
		variant: ThemeVariantName,
		token: ColorTokenName,
		value: string,
	) => void;
	onSharedChange: <K extends keyof ThemeSharedTokens>(
		key: K,
		value: ThemeSharedTokens[K],
	) => void;
	onShadowChange: <K extends keyof ThemeShadowTokens>(
		key: K,
		value: ThemeShadowTokens[K],
	) => void;
	onDeriveDark: () => void;
	disabled: boolean;
}

/**
 * Todo lo editable del tema, por secciones.
 *
 * No trae contenedor propio: la ruta lo compone dentro de la misma superficie
 * que el informe de contraste, y las secciones se separan con un divisor.
 */
export function ThemeTokenPanel({
	tokens,
	variant,
	onVariantChange,
	onColorChange,
	onSharedChange,
	onShadowChange,
	onDeriveDark,
	disabled,
}: ThemeTokenPanelProps) {
	const colors = tokens[variant];
	const { shared } = tokens;

	// El aviso cruza los dos sliders: el alto de un control sale del espaciado y
	// su texto del tamaño base, así que ninguno de los dos puede avisar solo.
	const density = useMemo(
		() =>
			evaluateDensity({
				spacing: shared.spacing,
				fontSize: shared.fontSize,
			}),
		[shared.spacing, shared.fontSize],
	);

	return (
		<>
			{/* La variante en edición manda sobre toda la pantalla, así que se elige
			    arriba del todo y fuera del `fieldset`: en un preset no se puede
			    editar el oscuro, pero sí mirarlo. */}
			<div className="flex items-center gap-2 border-b p-3">
				<fieldset className="flex rounded-md border p-0.5">
					<legend className="sr-only">Variante en edición</legend>
					{(["light", "dark"] as const).map((option) => (
						<Button
							key={option}
							type="button"
							size="sm"
							variant={variant === option ? "secondary" : "ghost"}
							aria-pressed={variant === option}
							onClick={() => onVariantChange(option)}
							className="h-7 gap-1.5 px-2"
						>
							{option === "light" ? (
								<Sun className="size-3.5" />
							) : (
								<Moon className="size-3.5" />
							)}
							{option === "light" ? "Claro" : "Oscuro"}
						</Button>
					))}
				</fieldset>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={disabled}
							onClick={onDeriveDark}
							className="ml-auto gap-1.5"
						>
							<WandSparkles className="size-3.5" />
							Derivar oscuro
						</Button>
					</TooltipTrigger>
					<TooltipContent className="max-w-64">
						Invierte la luminancia de la variante clara conservando tono y
						croma. Es un punto de partida editable: revisa después el contraste.
					</TooltipContent>
				</Tooltip>
			</div>

			{/*
			 * El bloqueo de un preset es real, no una capa por encima.
			 *
			 * Antes era `pointer-events-none opacity-60`: el ratón no llegaba, pero
			 * con el teclado se seguían moviendo sliders y selects —cambiando el
			 * estado local de un tema que el servidor iba a rechazar—, y ese 60% de
			 * opacidad dejaba el texto en 2,30:1. Un `fieldset disabled` deshabilita
			 * de verdad todo control que tenga dentro y no toca el contraste.
			 *
			 * `display: contents` para que el fieldset no altere la columna: las
			 * secciones siguen siendo hijas directas de la superficie.
			 */}
			<fieldset disabled={disabled} className="contents">
				<ThemeSection title="Colores" defaultOpen readOnly={disabled}>
					{ESSENTIAL_GROUPS.map((group) => (
						<ColorGroupFields
							key={group.label}
							group={group}
							colors={colors}
							variant={variant}
							onColorChange={onColorChange}
						/>
					))}
				</ThemeSection>

				<ThemeSection
					title="Colores avanzados"
					description="Bordes y foco, gráficas y barra lateral"
					readOnly={disabled}
				>
					{ADVANCED_GROUPS.map((group) => (
						<ColorGroupFields
							key={group.label}
							group={group}
							colors={colors}
							variant={variant}
							onColorChange={onColorChange}
						/>
					))}
				</ThemeSection>

				<ThemeSection
					title="Tipografía"
					description="Solo familias que esta aplicación auto-hospeda"
					readOnly={disabled}
				>
					<FontSelect
						label="Texto"
						hint="todo el cuerpo de la interfaz"
						value={shared.fontSans}
						onChange={(value) => onSharedChange("fontSans", value)}
						only="sans"
					/>
					<FontSelect
						label="Titulares"
						hint="h1–h3 y los títulos de tarjeta, diálogo y panel"
						value={shared.fontHeading}
						onChange={(value) => onSharedChange("fontHeading", value)}
					/>
					<FontSelect
						label="Serif"
						hint="contenido editorial: la utilidad font-serif"
						value={shared.fontSerif}
						onChange={(value) => onSharedChange("fontSerif", value)}
						only="serif"
					/>
					<FontSelect
						label="Monoespaciada"
						hint="VIN, códigos y valores de color"
						value={shared.fontMono}
						onChange={(value) => onSharedChange("fontMono", value)}
						only="mono"
					/>
					<LengthField
						label="Tamaño base"
						token="fontSize"
						value={shared.fontSize}
						hint="Mueve la escala entera, de text-xs a text-5xl."
						onChange={(value) => onSharedChange("fontSize", value)}
					/>
					<LengthField
						label="Espaciado entre letras"
						token="letterSpacing"
						value={shared.letterSpacing}
						onChange={(value) => onSharedChange("letterSpacing", value)}
					/>
				</ThemeSection>

				{/*
				 * Radio, borde y espaciado eran tres secciones de uno o dos sliders.
				 * Son la misma decisión —cuánto mide y cuánto respira la interfaz— y
				 * se toman mirando la galería, no por separado.
				 */}
				<ThemeSection
					title="Medidas"
					description="Radio, grosor de borde y la unidad base de p-*, gap-*, h-* y size-*"
					status={
						density.length === 0
							? undefined
							: `${density.length} ${density.length === 1 ? "aviso" : "avisos"}`
					}
					tone="danger"
					readOnly={disabled}
				>
					<LengthField
						label="Radio"
						token="radius"
						value={shared.radius}
						onChange={(value) => onSharedChange("radius", value)}
					/>
					<LengthField
						label="Grosor de borde"
						token="borderWidth"
						value={shared.borderWidth}
						onChange={(value) => onSharedChange("borderWidth", value)}
					/>
					<LengthField
						label="Unidad de espaciado"
						token="spacing"
						value={shared.spacing}
						hint="Además del aire, decide el alto de botones, campos e iconos."
						onChange={(value) => onSharedChange("spacing", value)}
					/>

					{/*
					 * El equivalente del informe de contraste para las medidas.
					 *
					 * Aquí el admin no recibía ningún aviso: con el espaciado al mínimo
					 * un botón quedaba más bajo que su propio texto y los iconos bajaban
					 * del objetivo de 24 px de WCAG, y nada lo decía. El suelo del slider
					 * ya impide lo peor; esto explica la banda estrecha que queda.
					 */}
					{density.length > 0 && (
						<ul className="flex flex-col gap-2">
							{density.map((issue) => (
								<li key={issue.id} className="flex items-start gap-2 text-xs">
									<CircleAlert
										className="mt-0.5 size-3.5 shrink-0 text-destructive"
										aria-hidden="true"
									/>
									<span>
										<span className="font-medium text-destructive">
											{issue.title}.
										</span>{" "}
										<span className="text-muted-foreground">
											{issue.detail}
										</span>
									</span>
								</li>
							))}
						</ul>
					)}
				</ThemeSection>

				<ThemeSection
					title="Sombras"
					description="La escala --shadow-2xs … --shadow-2xl se deriva de estos seis valores"
					readOnly={disabled}
				>
					<ColorField
						label="Color"
						value={shared.shadow.color}
						onChange={(value) => onShadowChange("color", value)}
					/>
					<RangeField
						label="Opacidad"
						min={0}
						max={1}
						step={0.01}
						value={shared.shadow.opacity}
						onChange={(value) => onShadowChange("opacity", value)}
					/>
					<RangeField
						label="Desenfoque (px)"
						min={0}
						max={40}
						step={1}
						value={shared.shadow.blur}
						onChange={(value) => onShadowChange("blur", value)}
					/>
					<RangeField
						label="Expansión (px)"
						min={-8}
						max={8}
						step={1}
						value={shared.shadow.spread}
						onChange={(value) => onShadowChange("spread", value)}
					/>
					<RangeField
						label="Desplazamiento X (px)"
						min={-16}
						max={16}
						step={1}
						value={shared.shadow.offsetX}
						onChange={(value) => onShadowChange("offsetX", value)}
					/>
					<RangeField
						label="Desplazamiento Y (px)"
						min={-16}
						max={16}
						step={1}
						value={shared.shadow.offsetY}
						onChange={(value) => onShadowChange("offsetY", value)}
					/>
				</ThemeSection>
			</fieldset>
		</>
	);
}
