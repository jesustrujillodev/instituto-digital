import { Badge } from "@/shared/components/ui/badge";
import {
	ACCESS_LABELS,
	FORMAT_LABELS,
	MODALITY_LABELS,
	STATUS_LABELS,
} from "../domain/course.labels";
import type {
	CourseAccessType,
	CourseFormat,
	CourseModality,
	CourseStatus,
} from "../domain/course.rules";
import { requiresSessions } from "../domain/course.rules";

const STATUS_VARIANTS = {
	DRAFT: "secondary",
	PUBLISHED: "default",
	FINISHED: "outline",
	CANCELLED: "destructive",
} as const satisfies Record<CourseStatus, string>;

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
	return (
		<Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
	);
}

export function CourseModalityBadge({
	modality,
}: {
	modality: CourseModality;
}) {
	return <Badge variant="outline">{MODALITY_LABELS[modality]}</Badge>;
}

/**
 * Solo se pinta el autogestivo: etiquetar "Calendarizado" todo lo demás sería
 * repetir en cada tarjeta lo que ya es el caso de siempre.
 */
export function CourseFormatBadge({ format }: { format: CourseFormat }) {
	if (requiresSessions(format)) return null;

	return <Badge variant="secondary">{FORMAT_LABELS[format]}</Badge>;
}

export function CourseAccessBadge({ access }: { access: CourseAccessType }) {
	return <Badge variant="outline">{ACCESS_LABELS[access]}</Badge>;
}

/**
 * El renglón bajo el título de toda ficha. Quien administra ve siempre el
 * estado; el participante, solo cuando no está publicada.
 */
export function CourseDetailBadges({
	course,
	hidePublished = false,
}: {
	course: {
		status: CourseStatus;
		modality: CourseModality;
		format: CourseFormat;
		access: CourseAccessType;
	};
	hidePublished?: boolean;
}) {
	return (
		<div className="mb-6 flex flex-wrap items-center gap-2">
			{!(hidePublished && course.status === "PUBLISHED") && (
				<CourseStatusBadge status={course.status} />
			)}
			<CourseModalityBadge modality={course.modality} />
			<CourseFormatBadge format={course.format} />
			<CourseAccessBadge access={course.access} />
		</div>
	);
}
