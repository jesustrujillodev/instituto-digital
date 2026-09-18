import {
	ArrowRight,
	Building2,
	CalendarDays,
	Layers,
	User,
} from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
import { Card, CardContent, CardFooter } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { AvailableCourse } from "../domain/enrollment.types";
import { ENROLLMENT_STATUS_LABELS } from "../utils/enrollment-labels";
import { CourseCover } from "./course-cover";
import { SeatsBadge } from "./enrollment-badges";

/**
 * Distintivo sobre la portada.
 *
 * Los distintivos normales del proyecto son de contorno y viven sobre papel;
 * encima de una fotografía cualquiera no se leen. El tono `marca` queda para el
 * estado propio —que solo tienen unas pocas tarjetas—, así el guinda sigue
 * señalando y no rellenando.
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

function Meta({
	icon: Icon,
	children,
}: {
	icon: typeof Building2;
	children: React.ReactNode;
}) {
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5">
			<Icon className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="truncate">{children}</span>
		</span>
	);
}

interface CourseCardProps {
	course: AvailableCourse;
	/** Las primeras tarjetas cargan su portada sin esperar al scroll. */
	eager?: boolean;
}

export function CourseCard({ course, eager }: CourseCardProps) {
	const sessions =
		course.sessionCount === 1 ? "1 sesión" : `${course.sessionCount} sesiones`;

	const trainers =
		course.trainerCount > 1
			? `${course.trainerName} +${course.trainerCount - 1}`
			: course.trainerName;

	return (
		// `pt-0`: el relleno superior de Card solo se anula cuando su primer hijo es
		// un `<img>`, y aquí es el contenedor que además sostiene los distintivos.
		// Sin esto queda una franja de tarjeta sobre cada portada. El anillo de foco
		// es el mismo que usa el resto de la app (button.tsx), no uno propio.
		<Card
			size="sm"
			className="relative h-full pt-0 transition-shadow duration-200 hover:shadow-lg has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/30"
		>
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
					<CoverBadge>{MODALITY_LABELS[course.modality]}</CoverBadge>
					{course.myStatus && (
						<CoverBadge tone="brand">
							{ENROLLMENT_STATUS_LABELS[course.myStatus]}
						</CoverBadge>
					)}
				</div>
			</div>

			<CardContent className="flex min-w-0 flex-1 flex-col gap-2">
				{/* El enlace cubre la tarjeta entera: una sola parada de tabulación y
				    ningún interactivo anidado que duplique el destino. */}
				<h2 className="font-heading font-medium text-base leading-snug">
					<Link
						to={`/dashboard/cursos-disponibles/${course.documentId}`}
						className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-['']"
					>
						{course.title}
					</Link>
				</h2>

				{course.description && (
					<p className="line-clamp-2 text-muted-foreground text-sm">
						{course.description}
					</p>
				)}

				<div className="mt-auto flex flex-col gap-1 pt-1 text-muted-foreground text-xs">
					<Meta icon={Building2}>{course.dependencyName}</Meta>
					<div className="flex min-w-0 items-center gap-3">
						<Meta icon={CalendarDays}>
							{course.firstSessionAt
								? formatZonedDate(new Date(course.firstSessionAt))
								: "Sin fecha"}
						</Meta>
						<Meta icon={Layers}>{sessions}</Meta>
					</div>
					{trainers && <Meta icon={User}>{trainers}</Meta>}
				</div>
			</CardContent>

			<CardFooter className="mt-auto flex-wrap justify-between gap-2 border-t pt-4">
				<div className="flex flex-wrap items-center gap-2">
					<SeatsBadge capacity={course.capacity} seatsLeft={course.seatsLeft} />
					{course.closesSoon && course.closesAt && (
						<span className="font-medium text-warning-foreground text-xs">
							Cierra el {formatZonedDate(new Date(course.closesAt))}
						</span>
					)}
				</div>

				<span className="inline-flex items-center gap-1 font-medium text-primary text-sm">
					Ver curso
					<ArrowRight
						className="size-4 transition-transform duration-200 group-hover/card:translate-x-0.5"
						aria-hidden="true"
					/>
				</span>
			</CardFooter>
		</Card>
	);
}

/** Silueta de la tarjeta mientras el loader responde. */
export function CourseCardSkeleton() {
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
