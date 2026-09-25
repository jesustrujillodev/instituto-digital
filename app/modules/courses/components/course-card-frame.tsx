import type { LucideIcon } from "lucide-react";
import { Building2 } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { CourseCover } from "@/modules/enrollments/components/course-cover";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { ViewMode } from "@/shared/view-mode/view-mode";
import type { CourseFormat, CourseModality } from "../domain/course.rules";
import { requiresSessions } from "../domain/course.rules";
import { MODALITY_LABELS } from "../utils/course-labels";

export interface CourseMetaItem {
	icon: LucideIcon;
	label: string;
	/** Ocupa su propia línea en la cuadrícula: nombres largos, como un capacitador. */
	wide?: boolean;
}

interface CourseCardFrameProps {
	layout: ViewMode;
	href: string;
	course: {
		documentId: string;
		title: string;
		modality: CourseModality;
		/** Sin él, la tarjeta no puede decir «A tu ritmo». */
		format?: CourseFormat;
		coverUrl: string | null;
		/** La que organiza. Se omite cuando todas las tarjetas son de la misma. */
		dependencyName?: string | null;
	};
	/** Estado propio de quien mira. Es lo único que se pinta en guinda. */
	highlight?: string | null;
	description?: string | null;
	meta?: readonly CourseMetaItem[];
	/**
	 * En cuadrícula, el bloque sobre el estado (el avance, la fecha de inicio);
	 * en lista, el renglón bajo los datos. Puede traer enlaces: va sobre el que
	 * cubre la tarjeta.
	 */
	detail?: React.ReactNode;
	/** En cuadrícula, sobre las acciones; en lista, arriba a la derecha. */
	status?: React.ReactNode;
	/** Controles propios; se elevan sobre el enlace que cubre la tarjeta. */
	actions?: React.ReactNode;
	menu?: React.ReactNode;
	/** Cancelado o ya sin participación: la portada se apaga. */
	dimmed?: boolean;
	eager?: boolean;
	className?: string;
}

/** «Presencial», «En línea · A tu ritmo». */
export const modalityLabelOf = (course: {
	modality: CourseModality;
	format?: CourseFormat;
}) =>
	course.format && !requiresSessions(course.format)
		? `${MODALITY_LABELS[course.modality]} · A tu ritmo`
		: MODALITY_LABELS[course.modality];

type StatusTone = "success" | "warning" | "muted" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
	success: "text-success-foreground",
	warning: "text-warning-foreground",
	muted: "text-muted-foreground",
	neutral: "text-foreground",
};

/** El estado de la tarjeta: un icono y una frase, con el color que la nombra. */
export function CourseCardStatus({
	icon: Icon,
	tone = "neutral",
	note,
	children,
}: {
	icon?: LucideIcon;
	tone?: StatusTone;
	/** Una aclaración bajo el estado, en gris. */
	note?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<p
				className={cn(
					"flex items-center gap-1.5 font-medium text-xs tabular-nums",
					TONE_CLASSES[tone],
				)}
			>
				{Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
				{children}
			</p>
			{note && <p className="text-muted-foreground text-xs">{note}</p>}
		</div>
	);
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
 * tabulación para abrir la ficha. Lo interactivo propio (`actions`, `menu`,
 * enlaces del `detail`) no se anida en él; se eleva por encima con `z-10`.
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

/**
 * En cuadrícula, cada acción ocupa lo que quede de la fila, salvo los botones
 * de icono (el «Más acciones»), que conservan su cuadro.
 */
const gridActions =
	"relative z-10 flex gap-2 empty:hidden [&>*:not([data-size^='icon'])]:flex-1";

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
		<h3 className={cn("font-heading font-medium leading-snug", className)}>
			<Link
				to={href}
				className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-['']"
			>
				{title}
			</Link>
		</h3>
	);
}

function Cover({
	course,
	dimmed,
	eager,
	className,
}: Pick<CourseCardFrameProps, "course" | "dimmed" | "eager"> & {
	className?: string;
}) {
	return (
		<div
			className={cn(
				"aspect-video shrink-0 overflow-hidden bg-muted",
				dimmed && "opacity-60 grayscale",
				className,
			)}
		>
			<CourseCover
				documentId={course.documentId}
				title={course.title}
				modality={course.modality}
				src={course.coverUrl}
				eager={eager}
				className="transition-transform duration-300 ease-out group-hover/card:scale-[1.03]"
			/>
		</div>
	);
}

function GridCard({
	href,
	course,
	highlight,
	description,
	meta = [],
	detail,
	status,
	actions,
	menu,
	dimmed,
	eager,
	className,
}: CourseCardFrameProps) {
	return (
		<Card size="sm" className={cn("h-full pt-0", cardInteraction, className)}>
			<div className="relative">
				<Cover
					course={course}
					dimmed={dimmed}
					eager={eager}
					className="w-full rounded-t-4xl"
				/>

				<div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-1.5 p-3 pr-12">
					<CoverBadge>{modalityLabelOf(course)}</CoverBadge>
					{highlight && <CoverBadge tone="brand">{highlight}</CoverBadge>}
				</div>

				{menu && <div className="absolute top-2 right-2 z-10">{menu}</div>}
			</div>

			<div className="flex flex-1 flex-col gap-4 px-(--card-spacing)">
				<div className="flex flex-col gap-1.5">
					<TitleLink href={href} title={course.title} className="text-base" />

					{description && (
						<p className="line-clamp-2 text-muted-foreground text-sm">
							{description}
						</p>
					)}

					{(course.dependencyName || meta.length > 0) && (
						<div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
							{course.dependencyName && (
								<Meta
									item={{
										icon: Building2,
										label: course.dependencyName,
										wide: true,
									}}
									layout="grid"
								/>
							)}
							{meta.map((item) => (
								<Meta key={item.label} item={item} layout="grid" />
							))}
						</div>
					)}
				</div>

				{(detail || status || actions) && (
					<div className="mt-auto flex flex-col gap-3">
						{detail && (
							<div className="relative z-10 empty:hidden">{detail}</div>
						)}
						{status}
						{actions && <div className={gridActions}>{actions}</div>}
					</div>
				)}
			</div>
		</Card>
	);
}

function ListCard({
	href,
	course,
	highlight,
	description,
	meta = [],
	detail,
	status,
	actions,
	menu,
	dimmed,
	eager,
	className,
}: CourseCardFrameProps) {
	return (
		<Card
			size="sm"
			className={cn(
				"flex-row flex-wrap items-center gap-x-4 gap-y-3 px-(--card-spacing) md:flex-nowrap",
				cardInteraction,
				className,
			)}
		>
			<Cover
				course={course}
				dimmed={dimmed}
				eager={eager}
				className="w-24 rounded-2xl sm:w-36"
			/>

			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<TitleLink
					href={href}
					title={course.title}
					className="text-sm sm:text-base"
				/>

				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<span className="font-medium text-foreground">
						{modalityLabelOf(course)}
					</span>
					{highlight && <Badge>{highlight}</Badge>}
					{course.dependencyName && (
						<Meta
							item={{ icon: Building2, label: course.dependencyName }}
							layout="list"
						/>
					)}
					{meta.map((item) => (
						<Meta key={item.label} item={item} layout="list" />
					))}
				</div>

				{description && (
					<p className="line-clamp-1 text-muted-foreground text-sm">
						{description}
					</p>
				)}

				{detail && <div className="relative z-10 empty:hidden">{detail}</div>}
			</div>

			{(status || actions) && (
				<div className="flex basis-full flex-wrap items-center justify-between gap-2 md:basis-auto md:flex-col md:items-end md:justify-center">
					{status}
					{actions && (
						<div className="relative z-10 flex flex-wrap items-center gap-2">
							{actions}
						</div>
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
					? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
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
				<div className="hidden flex-col items-end gap-2 md:flex">
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-9 w-28 rounded-4xl" />
				</div>
			</Card>
		);
	}

	return (
		<Card size="sm" className="h-full pt-0">
			<Skeleton className="aspect-video w-full rounded-none rounded-t-4xl" />
			<div className="flex flex-1 flex-col gap-4 px-4">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-5 w-4/5" />
					<Skeleton className="h-3 w-1/2" />
					<Skeleton className="h-3 w-3/5" />
				</div>
				<div className="mt-auto flex flex-col gap-3">
					<Skeleton className="h-3 w-2/5" />
					<Skeleton className="h-9 w-full rounded-4xl" />
				</div>
			</div>
		</Card>
	);
}
