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
