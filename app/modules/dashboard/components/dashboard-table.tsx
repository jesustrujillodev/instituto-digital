import { cn } from "@/lib/utils";
import { Card } from "@/shared/components/ui/card";

/**
 * Las filas de las tablas del panel. Las columnas se abren con el ancho de la
 * tarjeta, no de la ventana: la misma tabla vive en la columna angosta del
 * panel y a todo lo ancho.
 */
export const TABLE_ROW = "px-5 py-4 @xl:px-6";

/** Una tarjeta-tabla: resumen arriba y renglones separados por un filete. */
export function TableCard({ children }: { children: React.ReactNode }) {
	return <Card className="@container gap-0 py-0">{children}</Card>;
}

/** La cifra que resume la tabla y lo que la compone. */
export function TableSummary({
	figure,
	children,
}: {
	figure?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1 border-b px-5 py-5 @xl:flex-row @xl:items-baseline @xl:gap-4 @xl:px-6">
			{figure && (
				<p className="shrink-0 font-bold text-3xl text-foreground tabular-nums tracking-tight">
					{figure}
				</p>
			)}
			<p className="text-muted-foreground text-sm tabular-nums">{children}</p>
		</div>
	);
}

/** Un grupo de renglones, con su rótulo cuando la tabla tiene más de uno. */
export function TableGroup({
	label,
	children,
}: {
	label?: string;
	children: React.ReactNode;
}) {
	return (
		<>
			{label && (
				<p className="border-b bg-muted/40 px-5 py-2 font-medium text-muted-foreground text-xs @xl:px-6">
					{label}
				</p>
			)}
			<ul
				aria-label={label}
				className="flex flex-col divide-y not-last:border-b"
			>
				{children}
			</ul>
		</>
	);
}

/**
 * Una barra de avance con su cifra al lado: neutra mientras avanza y en verde
 * servicio al completarse, para que lo terminado se lea sin leer el número.
 */
export function MeterBar({
	percent,
	complete = false,
	label,
	value,
}: {
	percent: number;
	complete?: boolean;
	label: string;
	/** Lo que se lee junto a la barra; por omisión, el porcentaje. */
	value?: string;
}) {
	const width = Math.min(100, Math.max(0, percent));

	return (
		<>
			<div
				className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={width}
				aria-label={label}
			>
				<div
					className={cn(
						"h-full rounded-full",
						complete ? "bg-success-foreground" : "bg-foreground/70",
					)}
					style={{ width: `${width}%` }}
				/>
			</div>
			<span className="whitespace-nowrap text-right text-muted-foreground text-xs tabular-nums">
				{value ?? `${width} %`}
			</span>
		</>
	);
}

/** El pie de una tabla recortada: hacia la pantalla con la lista completa. */
export function TableFooter({ children }: { children: React.ReactNode }) {
	return <div className="px-5 py-3 @xl:px-6">{children}</div>;
}
