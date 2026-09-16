import { CircleAlert, CircleCheck, CircleHelp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	CONTRAST_MINIMUM,
	type ContrastResult,
	evaluateContrast,
	type ThemeTokens,
	type ThemeVariantName,
} from "../domain/theme.rules";
import { ThemeSection } from "./theme-section";

/**
 * Cómo se anuncia cada fila.
 *
 * El color NO es el único portador: cada estado lleva icono y texto, y los tres
 * tonos que se usan (`foreground`, `muted-foreground`, `destructive` sobre
 * `card`) son pares que este mismo panel mide. Un guardarraíl que se pinta con
 * combinaciones que no comprueba no tiene autoridad para avisar de nada.
 */
const STATUS = {
	pass: {
		className: "text-muted-foreground",
		Icon: CircleCheck,
	},
	short: {
		className: "text-destructive",
		Icon: CircleAlert,
	},
	info: {
		className: "text-muted-foreground",
		Icon: Info,
	},
	unknown: {
		className: "text-muted-foreground",
		Icon: CircleHelp,
	},
} as const;

/** Qué pone al final de la fila: el grado WCAG, o el mínimo que le falta. */
const verdict = (result: ContrastResult): string => {
	if (result.ratio === null) return "sin medir";
	if (result.usage === "info") return "informativo";

	const minimum = CONTRAST_MINIMUM[result.usage];
	if (result.passes === false) return `por debajo de ${minimum}:1`;

	return result.usage === "ui" ? "cumple 3:1" : (result.level ?? "");
};

const statusOf = (result: ContrastResult) => {
	if (result.ratio === null) return STATUS.unknown;
	if (result.usage === "info") return STATUS.info;
	return result.passes ? STATUS.pass : STATUS.short;
};

function Row({
	result,
	colors,
}: {
	result: ContrastResult;
	colors: Record<string, string>;
}) {
	const { className, Icon } = statusOf(result);

	// El texto se enseña como texto y el borde como borde: una muestra "Aa" para
	// el anillo de foco mediría con los ojos algo que no es lo que se mide.
	const swatch =
		result.usage === "text" ? (
			<span
				className="flex size-8 shrink-0 items-center justify-center rounded border text-xs font-semibold"
				style={{
					backgroundColor: colors[result.background],
					color: colors[result.foreground],
				}}
				aria-hidden="true"
			>
				Aa
			</span>
		) : (
			<span
				className="size-8 shrink-0 rounded"
				style={{
					backgroundColor: colors[result.background],
					boxShadow: `inset 0 0 0 2px ${colors[result.foreground]}`,
				}}
				aria-hidden="true"
			/>
		);

	return (
		<li className="flex items-center gap-3 py-1.5">
			{swatch}

			<span className="min-w-0 flex-1">
				<span className="block truncate text-xs text-foreground">
					{result.label}
				</span>
				<span className="block truncate font-mono text-xs text-muted-foreground">
					{result.foreground}
					{result.tint === undefined
						? ` · ${result.background}`
						: ` · ${result.background} + ${result.foreground}/${result.tint * 100}%`}
				</span>
			</span>

			<span
				className={cn(
					"flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums",
					className,
				)}
			>
				<Icon className="size-3.5" />
				{result.ratio === null ? "sin medir" : `${result.ratio}:1`}
				<span className="hidden sm:inline">· {verdict(result)}</span>
			</span>
		</li>
	);
}

/**
 * Ratios WCAG de los pares que la interfaz combina de verdad, en la variante en
 * edición.
 *
 * AVISA; no bloquea publicar (decisión #11: el admin manda). El objetivo es que
 * nadie publique un tema ilegible sin haberlo sabido, no impedírselo — hay casos
 * legítimos, como un color de marca que solo se usa en piezas grandes.
 *
 * Va plegada y con el veredicto en el disparador. Desplegada son veinte filas,
 * y lo accionable de esas veinte son las que fallan: por eso se ordenan primero.
 * El recuento cuenta los pares que no llegan a SU mínimo, no solo los que se
 * quedan por debajo de 3:1 — un par de texto en 4,34 no cumple AA aunque el
 * grado diga "solo texto grande", y decirlo de otra forma sería un permiso falso.
 */
export function ContrastPanel({
	tokens,
	variant,
}: {
	tokens: ThemeTokens;
	variant: ThemeVariantName;
}) {
	const colors = tokens[variant];
	const results = evaluateContrast(colors);
	const short = results.filter((result) => result.passes === false).length;
	const unmeasured = results.filter((result) => result.ratio === null).length;

	// `false` primero, después `null` (sin medir o informativo), y al final lo
	// que cumple: veinte filas en las que hay que buscar el problema no son un
	// informe, son una lista.
	const ordered = [...results].sort((a, b) => rank(a.passes) - rank(b.passes));

	return (
		<ThemeSection
			title={`Contraste · ${variant === "light" ? "claro" : "oscuro"}`}
			status={
				short > 0
					? `${short} ${short === 1 ? "par corto" : "pares cortos"}`
					: "Todos cumplen"
			}
			tone={short > 0 ? "danger" : "muted"}
			defaultOpen={short > 0}
		>
			{/* La leyenda va DENTRO y no en el disparador: la sección está plegada
			    casi siempre, y el veredicto de al lado ya dice lo único que hay que
			    saber sin abrirla. */}
			<p className="text-xs text-muted-foreground">
				Texto 4,5:1 (AA) · bordes de campo y anillo de foco 3:1 (WCAG 1.4.11).
				Los pares informativos se miden pero no se exigen. Es un aviso, no un
				bloqueo: puedes publicar igualmente.
			</p>

			{unmeasured > 0 && (
				<p className="text-xs text-muted-foreground">
					{unmeasured === 1
						? "Un par sin medir tiene algún color ilegible."
						: `${unmeasured} pares sin medir tienen algún color ilegible.`}
				</p>
			)}

			<ul className="divide-y">
				{ordered.map((result) => (
					<Row
						key={`${result.background}-${result.foreground}-${result.usage}`}
						result={result}
						colors={colors}
					/>
				))}
			</ul>
		</ThemeSection>
	);
}

/** Orden de urgencia: falla, sin veredicto, cumple. */
const rank = (passes: ContrastResult["passes"]) => {
	if (passes === false) return 0;
	return passes === null ? 1 : 2;
};
