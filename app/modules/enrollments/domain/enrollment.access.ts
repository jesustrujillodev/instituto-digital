import {
	ACTIVE_ENROLLMENT_STATUSES,
	type EnrollmentStatus,
} from "./enrollment.config";

export type CatalogAccessWhere = {
	OR: [
		{ access: { not: "INVITATION" } },
		{
			enrollments: {
				some: { userId: number; status: { in: readonly EnrollmentStatus[] } };
			};
		},
	];
};

/**
 * Qué cursos puede ver una persona en el catálogo, además de su visibilidad.
 *
 * Un curso por invitación solo existe allí para quien fue invitado: con la
 * invitación pendiente o ya aceptada. Administrarlo o impartirlo no basta, porque
 * `courseVisibilityWhere` abre esos cursos a su titular, auxiliar y capacitador,
 * que los gestionan desde /dashboard/capacitaciones y no se inscriben en ellos.
 */
export const catalogAccessWhere = (userId: number): CatalogAccessWhere => ({
	OR: [
		{ access: { not: "INVITATION" } },
		{
			enrollments: {
				some: { userId, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
			},
		},
	],
});

/**
 * Cursos con la inscripción abierta en `now`, en términos de consulta: lo mismo
 * que `isEnrollmentOpen` decide sobre un curso ya leído. Un calendarizado lo
 * está mientras tenga sesiones y ninguna haya empezado; un autogestivo no tiene
 * ninguna que mirar (docs/adr/0011).
 */
export const openEnrollmentWhere = (now: Date) =>
	[
		{ status: "PUBLISHED" },
		{
			OR: [
				{ format: "SELF_PACED" },
				{ sessions: { some: {}, none: { startsAt: { lte: now } } } },
			],
		},
		{ OR: [{ enrollmentDeadline: null }, { enrollmentDeadline: { gt: now } }] },
		{ enrollmentClosedAt: null },
	] as const;

export type OpenEnrollmentWhere = ReturnType<typeof openEnrollmentWhere>;
