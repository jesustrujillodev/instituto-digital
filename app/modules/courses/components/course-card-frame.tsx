import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { CourseCover } from "@/modules/enrollments/components/course-cover";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { ViewMode } from "@/shared/view-mode/view-mode";
import type { CourseModality } from "../domain/course.rules";
import { MODALITY_LABELS } from "../utils/course-labels";

export interface CourseMetaItem {
	icon: LucideIcon;
	label: string;
	/** Ocupa su propia línea en la cuadrícula: nombres largos, como la dependencia. */
	wide?: boolean;
}

interface CourseCardFrameProps {
	layout: ViewMode;
	href: string;
	course: {
		documentId: string;
		title: string;
		modality: CourseModality;
		coverUrl: string | null;
	};
	/** Estado propio de quien mira. Es lo único que se pinta en guinda. */
	highlight?: string | null;
	description?: string | null;
	meta: readonly CourseMetaItem[];
	/** Distintivos del pie: estado, cupo, resultado. */
	footer?: React.ReactNode;
	/** Rótulo del destino. No es interactivo: el clic lo recoge el enlace. */
	cta?: React.ReactNode;
	/** Controles propios de la tarjeta; se elevan sobre el enlace que la cubre. */
	actions?: React.ReactNode;
	menu?: React.ReactNode;
	/** Solo en lista, donde hay ancho para leerlo sin abrir la ficha. */
	details?: React.ReactNode;
	eager?: boolean;
}

/**
 * Pastilla sobre la portada.
 *
 * Los distintivos del proyecto son de contorno y viven sobre papel; encima de
 * una fotografía cualquiera no se leen.
 */
function CoverBadge({
	tone = "neutral",
	children,
}: {
	tone?: "neutral" | "brand";
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-6 items-center rounded-3xl px-2.5 font-medium text-xs shadow-sm",
				tone === "brand"
					? "bg-primary text-primary-foreground"
					: "bg-background/90 text-foreground backdrop-blur-sm",
			)}
		>
			{children}
		</span>
	);
}

function Meta({ item, layout }: { item: CourseMetaItem; layout: ViewMode }) {
	const Icon = item.icon;

	return (
		<span
			className={cn(
				"inline-flex min-w-0 max-w-full items-center gap-1.5",
				layout === "grid" && item.wide && "basis-full",
			)}
		>
			<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="truncate">{item.label}</span>
		</span>
	);
}

/**
 * Tarjeta de curso en cuadrícula o en lista.
 *
 * El título es un enlace estirado sobre toda la tarjeta: una sola parada de
 * tabulación. Lo interactivo propio (`actions`, `menu`) no se anida en él; se
 * eleva por encima con `z-10`.
 */
export function CourseCardFrame(props: CourseCardFrameProps) {
	return props.layout === "grid" ? (
		<GridCard {...props} />
	) : (
		<ListCard {...props} />
	);
}

const cardInteraction =
	"relative transition-shadow duration-200 hover:shadow-lg has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/30";

function TitleLink({
	href,
	title,
	className,
}: {
	href: string;
	title: string;
	className?: string;
}) {
	return (
		<h2 className={cn("font-heading font-medium leading-snug", className)}>
			<Link
				to={href}
				className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-['']"
			>
				{title}
			</Link>
		</h2>
	);
}

function GridCard({
	href,
	course,
	highlight,
	description,
	meta,
	footer,
	cta,
	actions,
	menu,
	eager,
}: CourseCardFrameProps) {
	return (
		// `pt-0`: Card solo anula su relleno superior cuando el primer hijo es un
		// `<img>`, y aquí es el contenedor que además sostiene las pastillas.
		<Card size="sm" className={cn("h-full pt-0", cardInteraction)}>
			<div className="relative aspect-video w-full overflow-hidden rounded-t-4xl bg-muted">
				<CourseCover
					documentId={course.documentId}
					title={course.title}
					modality={course.modality}
					src={course.coverUrl}
					eager={eager}
					className="transition-transform duration-300 ease-out group-hover/card:scale-[1.03]"
				/>

				<div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
					<div className="flex flex-wrap gap-1.5">
						<CoverBadge>{MODALITY_LABELS[course.modality]}</CoverBadge>
						{menu && highlight && (
							<CoverBadge tone="brand">{highlight}</CoverBadge>
						)}
					</div>
					{!menu && highlight && (
						<CoverBadge tone="brand">{highlight}</CoverBadge>
					)}
				</div>

				{menu && <div className="absolute top-2 right-2 z-10">{menu}</div>}
			</div>

			<CardContent className="flex min-w-0 flex-1 flex-col gap-2">
				<TitleLink href={href} title={course.title} className="text-base" />

				{description && (
					<p className="line-clamp-2 text-muted-foreground text-sm">
						{description}
					</p>
				)}

				{meta.length > 0 && (
					<div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-muted-foreground text-xs">
						{meta.map((item) => (
							<Meta key={item.label} item={item} layout="grid" />
						))}
					</div>
				)}
			</CardContent>

			{(footer || cta || actions) && (
				<CardFooter className="mt-auto flex-wrap justify-between gap-2 border-t pt-4">
					<div className="flex flex-wrap items-center gap-2">{footer}</div>
					{actions ? (
						<div className="relative z-10 flex flex-wrap items-center gap-2">
							{actions}
						</div>
					) : (
						cta
					)}
				</CardFooter>
			)}
		</Card>
	);
}

function ListCard({
	href,
	course,
	highlight,
	description,
	meta,
	footer,
	cta,
	actions,
	menu,
	details,
}: CourseCardFrameProps) {
	return (
		<Card
			size="sm"
			className={cn(
				"flex-row flex-wrap items-start gap-x-4 gap-y-3 px-(--card-spacing) md:flex-nowrap md:items-center",
				cardInteraction,
			)}
		>
			<div className="aspect-video w-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:w-36">
				<CourseCover
					documentId={course.documentId}
					title={course.title}
					modality={course.modality}
					src={course.coverUrl}
				/>
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<TitleLink href={href} title={course.title} className="text-sm" />

				{description && (
					<p className="line-clamp-1 text-muted-foreground text-sm">
						{description}
					</p>
				)}

				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<Badge variant="outline">{MODALITY_LABELS[course.modality]}</Badge>
					{highlight && <Badge>{highlight}</Badge>}
					{meta.map((item) => (
						<Meta key={item.label} item={item} layout="list" />
					))}
				</div>

				{/* Puede traer enlaces (el de una sesión en línea): va sobre el enlace estirado. */}
				{details && <div className="relative z-10 pt-1">{details}</div>}
			</div>

			{(footer || cta || actions) && (
				<div className="order-last flex basis-full flex-wrap items-center justify-between gap-2 md:order-none md:basis-auto md:flex-col md:items-end md:justify-center">
					{footer && (
						<div className="flex flex-wrap items-center gap-2 md:justify-end">
							{footer}
						</div>
					)}
					{actions ? (
						<div className="relative z-10 flex flex-wrap items-center gap-2">
							{actions}
						</div>
					) : (
						cta
					)}
				</div>
			)}

			{menu && <div className="relative z-10 shrink-0">{menu}</div>}
		</Card>
	);
}

/** Contenedor de las tarjetas: la disposición decide columnas o renglones. */
export function CourseCardList({
	layout,
	children,
}: {
	layout: ViewMode;
	children: React.ReactNode;
}) {
	return (
		<ul
			className={
				layout === "grid"
					? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
					: "flex flex-col gap-3"
			}
		>
			{children}
		</ul>
	);
}

/** Silueta de la tarjeta mientras el loader responde. */
export function CourseCardSkeleton({ layout }: { layout: ViewMode }) {
	if (layout === "list") {
		return (
			<Card size="sm" className="flex-row items-center gap-4 px-4">
				<Skeleton className="aspect-video w-24 shrink-0 rounded-2xl sm:w-36" />
				<div className="flex flex-1 flex-col gap-2">
					<Skeleton className="h-4 w-3/5" />
					<Skeleton className="h-3 w-2/5" />
				</div>
				<Skeleton className="hidden h-5 w-24 md:block" />
			</Card>
		);
	}

	return (
		<Card size="sm" className="h-full pt-0">
			<Skeleton className="aspect-video w-full rounded-none rounded-t-4xl" />
			<CardContent className="flex flex-col gap-2">
				<Skeleton className="h-5 w-4/5" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
				<div className="flex flex-col gap-1.5 pt-1">
					<Skeleton className="h-3 w-1/2" />
					<Skeleton className="h-3 w-3/5" />
				</div>
			</CardContent>
			<CardFooter className="justify-between border-t pt-4">
				<Skeleton className="h-5 w-28" />
				<Skeleton className="h-5 w-20" />
			</CardFooter>
		</Card>
	);
}
