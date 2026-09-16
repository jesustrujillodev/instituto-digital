export const ENROLLMENT_ORIGINS = ["SELF", "ASSIGNED", "INVITATION"] as const;
export type EnrollmentOrigin = (typeof ENROLLMENT_ORIGINS)[number];

export const ENROLLMENT_STATUSES = [
	"INVITED",
	"ENROLLED",
	"DECLINED",
	"WITHDRAWN",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_RESULTS = ["PENDING", "PASSED", "FAILED"] as const;
export type EnrollmentResult = (typeof ENROLLMENT_RESULTS)[number];

/** Estados que dan acceso al curso e impiden volver a invitar. */
export const ACTIVE_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
	"INVITED",
	"ENROLLED",
];

export const AVAILABLE_LIST_DEFAULTS = {
	page: 1,
	pageSize: 10,
} as const;

export const ENROLLMENT_CANDIDATES_LIMIT = 20;

/** Tope de personas por envío de asignación o invitación. */
export const ENROLLMENT_BATCH_LIMIT = 200;
