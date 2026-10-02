import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/shared/components/ui/card";

/**
 * El esqueleto de toda ficha de capacitación —administración, catálogo y
 * «Mis capacitaciones»—, para que las tres se lean como la misma.
 *
 * En móvil manda la tarea: portada, estado, contenido y al final los detalles.
 * En escritorio todo lo que no es contenido va a la derecha; los detalles son
 * su propia celda para no tener que pintarlos dos veces.
 */
export function CourseDetailLayout({
	cover,
	status,
	aside,
	details,
	children,
}: {
	cover: React.ReactNode;
	status?: React.ReactNode;
	/** Paneles propios de la vista, debajo del estado. */
	aside?: React.ReactNode;
	details?: React.ReactNode;
	/** Las secciones de la columna principal. */
	children: React.ReactNode;
}) {
	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6">
			<div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
				{/* 16:9, la proporción a la que se recortó al subirla. */}
				<div className="aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5 lg:rounded-4xl">
					{cover}
				</div>
				{status}
				{aside}
			</div>

			<Card className="gap-0 py-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
				{children}
			</Card>

			{details && (
				<div className="lg:col-start-2 lg:row-start-2">{details}</div>
			)}
		</div>
	);
}

/** Un apartado de la columna principal: Descripción, Programa, Capacitadores… */
export function CourseDetailSection({
	title,
	aside,
	children,
}: {
	title: string;
	aside?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-4 border-border border-t p-6 first:border-t-0">
			<header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="font-medium text-base">{title}</h2>
				{aside && <p className="text-muted-foreground text-xs">{aside}</p>}
			</header>
			{children}
		</section>
	);
}

export interface CourseDetailFact {
	term: string;
	value: React.ReactNode;
}

/** La tarjeta «Detalles»: datos de consulta, uno debajo de otro. */
export function CourseDetailsCard({
	facts,
	className,
}: {
	facts: readonly CourseDetailFact[];
	className?: string;
}) {
	return (
		<Card size="sm" className={cn(className)}>
			<CardContent className="flex flex-col gap-3">
				<h2 className="font-medium text-base">Detalles</h2>
				<dl className="flex flex-col gap-3">
					{facts.map(({ term, value }) => (
						<div key={term} className="flex flex-col gap-0.5">
							<dt className="text-muted-foreground text-xs">{term}</dt>
							<dd className="text-sm">{value}</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}

/** El lugar de la persona o del curso, en la columna derecha. */
export function CourseDetailStatusCard({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-4">{children}</CardContent>
		</Card>
	);
}
