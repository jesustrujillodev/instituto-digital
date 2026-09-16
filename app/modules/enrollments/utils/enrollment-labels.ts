import type {
	EnrollmentOrigin,
	EnrollmentResult,
	EnrollmentStatus,
} from "../domain/enrollment.config";
import type { BatchResult } from "../domain/enrollment.types";

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
	INVITED: "Invitado",
	ENROLLED: "Inscrito",
	DECLINED: "Rechazó",
	WITHDRAWN: "Baja",
};

export const ENROLLMENT_ORIGIN_LABELS: Record<EnrollmentOrigin, string> = {
	SELF: "Propia",
	ASSIGNED: "Asignada",
	INVITATION: "Por invitación",
};

export const ENROLLMENT_RESULT_LABELS: Record<EnrollmentResult, string> = {
	PENDING: "Pendiente",
	PASSED: "Aprobado",
	FAILED: "No aprobado",
};

const plural = (count: number, singular: string, many: string) =>
	`${count} ${count === 1 ? singular : many}`;

/** "2 invitados, 1 omitido" — los omitidos ya tenían invitación o inscripción. */
export const batchMessage = (
	result: BatchResult,
	verb: { singular: string; plural: string },
): string => {
	const done = plural(result.affected, verb.singular, verb.plural);

	return result.skipped === 0
		? done
		: `${done}, ${plural(result.skipped, "omitido", "omitidos")}`;
};

export const personNameOf = (person: {
	firstName: string | null;
	lastName: string | null;
	email: string;
}): string =>
	[person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
	person.email;
