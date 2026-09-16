import { Badge } from "@/shared/components/ui/badge";
import type {
	EnrollmentOrigin,
	EnrollmentResult,
	EnrollmentStatus,
} from "../domain/enrollment.config";
import {
	ENROLLMENT_ORIGIN_LABELS,
	ENROLLMENT_RESULT_LABELS,
	ENROLLMENT_STATUS_LABELS,
} from "../utils/enrollment-labels";

const STATUS_VARIANTS = {
	INVITED: "secondary",
	ENROLLED: "default",
	DECLINED: "outline",
	WITHDRAWN: "outline",
} as const satisfies Record<EnrollmentStatus, string>;

export function EnrollmentStatusBadge({
	status,
}: {
	status: EnrollmentStatus;
}) {
	return (
		<Badge variant={STATUS_VARIANTS[status]}>
			{ENROLLMENT_STATUS_LABELS[status]}
		</Badge>
	);
}

export function EnrollmentOriginBadge({
	origin,
}: {
	origin: EnrollmentOrigin;
}) {
	return <Badge variant="outline">{ENROLLMENT_ORIGIN_LABELS[origin]}</Badge>;
}

export function EnrollmentResultBadge({
	result,
}: {
	result: EnrollmentResult;
}) {
	return <Badge variant="outline">{ENROLLMENT_RESULT_LABELS[result]}</Badge>;
}

export function SeatsBadge({
	capacity,
	seatsLeft,
}: {
	capacity: number | null;
	seatsLeft: number | null;
}) {
	if (capacity === null || seatsLeft === null) {
		return <Badge variant="outline">Sin cupo límite</Badge>;
	}

	return (
		<Badge variant={seatsLeft === 0 ? "destructive" : "outline"}>
			{seatsLeft === 0
				? `Lleno (${capacity}/${capacity})`
				: `${seatsLeft} de ${capacity} lugares`}
		</Badge>
	);
}
