import { Laptop, MapPin, Users } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import type { CourseModality } from "@/modules/courses/domain/course.rules";
import {
	type CoverPattern,
	coverDesignOf,
} from "../utils/course-cover-pattern";

const MODALITY_ICONS = {
	IN_PERSON: MapPin,
	ONLINE: Laptop,
	HYBRID: Users,
} as const satisfies Record<CourseModality, typeof MapPin>;

/**
 * El dibujo de cada trama, en un mosaico de 100×100 que luego se escala.
 *
 * Son formas exactas —líneas, círculos, rectángulos—, no una ilustración: la
 * placa tiene que leerse como una superficie institucional, no como un dibujo.
 */
const PATTERN_SHAPES: Record<CoverPattern, React.ReactNode> = {
	grid: (
		<path
			d="M0 0H100M0 50H100M0 0V100M50 0V100"
			stroke="currentColor"
			strokeWidth="6"
			fill="none"
		/>
	),
	diagonals: (
		<path
			d="M-25 25L25 -25M0 100L100 0M75 125L125 75"
			stroke="currentColor"
			strokeWidth="14"
			fill="none"
		/>
	),
	dots: (
		<>
			<circle cx="25" cy="25" r="9" fill="currentColor" />
			<circle cx="75" cy="75" r="9" fill="currentColor" />
		</>
	),
	chevron: (
		<path
			d="M-10 60L25 25L60 60M40 100L75 65L110 100"
			stroke="currentColor"
			strokeWidth="10"
			fill="none"
		/>
	),
	rings: (
		<>
			<circle
				cx="50"
				cy="50"
				r="42"
				stroke="currentColor"
				strokeWidth="7"
				fill="none"
			/>
			<circle
				cx="50"
				cy="50"
				r="18"
				stroke="currentColor"
				strokeWidth="7"
				fill="none"
			/>
		</>
	),
	bricks: (
		<>
			<rect x="4" y="6" width="44" height="34" fill="currentColor" />
			<rect x="56" y="56" width="44" height="34" fill="currentColor" />
		</>
	),
};

interface CourseCoverProps {
	/** Semilla de la placa cuando no hay imagen. */
	documentId: string;
	title: string;
	modality: CourseModality;
	/** URL ya resuelta (CDN o proxy). Sin ella se pinta la placa generada. */
	src: string | null;
	/** Lo pasa la tarjeta: la primera fila de la cuadrícula no debe ser perezosa. */
	eager?: boolean;
	className?: string;
}

/**
 * Portada del curso: la imagen subida o, sin ella, la placa de marca.
 *
 * Un solo componente para el catálogo, la ficha y Mis cursos — el encuadre lo
 * decide quien lo usa con `className`, y la proporción la impone el contenedor.
 */
export function CourseCover({
	documentId,
	title,
	modality,
	src,
	eager = false,
	className,
}: CourseCoverProps) {
	if (src) {
		return (
			<img
				src={src}
				alt={`Portada de ${title}`}
				loading={eager ? "eager" : "lazy"}
				decoding="async"
				className={cn("size-full object-cover", className)}
			/>
		);
	}

	return (
		<GeneratedCover
			documentId={documentId}
			modality={modality}
			className={className}
		/>
	);
}

function GeneratedCover({
	documentId,
	modality,
	className,
}: Pick<CourseCoverProps, "documentId" | "modality" | "className">) {
	// El id tiene que ser único en el documento: dos tarjetas con la misma trama
	// compartirían la definición y la segunda heredaría el giro de la primera.
	const patternId = useId();
	const { pattern, rotation, scale } = coverDesignOf(documentId);
	const Icon = MODALITY_ICONS[modality];

	return (
		<div
			className={cn(
				"relative size-full overflow-hidden bg-sidebar text-sidebar-primary",
				className,
			)}
			aria-hidden="true"
		>
			{/* Un campo plano se ve impreso; el velo lo levanta por una esquina. */}
			<div className="absolute inset-0 bg-radial-[at_18%_12%] from-sidebar-accent/70 to-transparent to-70%" />

			{/* Sin `<title>`: la placa entera es decorativa y ya va `aria-hidden`.
			    Un título aquí solo añadiría ruido al árbol de accesibilidad. */}
			<svg className="absolute inset-0 size-full opacity-[0.18]" role="none">
				<defs>
					<pattern
						id={patternId}
						width={scale}
						height={scale}
						patternUnits="userSpaceOnUse"
						patternTransform={`rotate(${rotation})`}
						viewBox="0 0 100 100"
					>
						{PATTERN_SHAPES[pattern]}
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill={`url(#${patternId})`} />
			</svg>

			<Icon
				className="absolute right-[-6%] bottom-[-14%] size-[54%] opacity-25"
				strokeWidth={1.25}
			/>
		</div>
	);
}
