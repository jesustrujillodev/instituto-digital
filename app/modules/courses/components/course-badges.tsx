import { Badge } from "@/shared/components/ui/badge";
import type {
	CourseAccessType,
	CourseModality,
	CourseStatus,
} from "../domain/course.rules";
import {
	ACCESS_LABELS,
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

export function CourseAccessBadge({ access }: { access: CourseAccessType }) {
	return <Badge variant="outline">{ACCESS_LABELS[access]}</Badge>;
}
