import { Badge } from "@/shared/components/ui/badge";
import type {
	CourseAccessType,
	CourseFormat,
	CourseModality,
	CourseStatus,
} from "../domain/course.rules";
import { requiresSessions } from "../domain/course.rules";
import {
	ACCESS_LABELS,
	FORMAT_LABELS,
	MODALITY_LABELS,
	STATUS_LABELS,
} from "../utils/course-labels";

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
