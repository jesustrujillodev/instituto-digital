import type { PrismaClient } from "@prisma/client";

/**
 * Estructura organizativa de prueba.
 *
 * Va aparte de seed.ts, igual que hacía el catálogo de inventario, porque es
 * sobre todo datos: la lógica cabe en una función y el ruido no debe enterrar el
 * resto de la semilla.
 *
 * El reparto no es decorativo. Cada pieza existe para poder probar una regla del
 * PRD-01 sin tener que montarla a mano:
 *
 * - DOS dependencias activas, para comprobar que un titular de una no ve a la
 *   gente de la otra. Con una sola, el aislamiento pasaría todas las pruebas por
 *   no tener con qué fallar.
 * - UNA desactivada, para comprobar que no admite personal nuevo ni aparece como
 *   destino de un cambio, y que su historial sigue consultable.
 * - Una de acogida (`Sin asignar`), que es la que usa la migración para reparar
 *   las cuentas anteriores al modelo y donde quedan las de la plantilla.
 * - Por dependencia activa: titular, auxiliar y dos participantes. Dos y no uno
 *   porque hace falta poder mover a alguien entre dependencias sin dejar una sin
 *   personal.
 */

/** Nombre de la dependencia de acogida. Lo comparte la migración inicial. */
export const UNASSIGNED_DEPENDENCY = "Sin asignar";

type Seeded = {
	unassignedId: number;
	dependencies: number;
	users: number;
};

const ACTIVE_DEPENDENCIES = [
	{ name: "Secretaría de Obras Públicas", acronym: "SOP", slug: "sop" },
	{ name: "Secretaría de Desarrollo Social", acronym: "SEDESOL", slug: "sds" },
] as const;

const ARCHIVED_DEPENDENCY = {
	name: "Instituto Municipal de Cultura",
	acronym: "IMC",
} as const;

/**
 * Plantilla de personal de cada dependencia activa.
 *
 * El titular va primero por claridad, no por necesidad: el índice único parcial
 * solo admite uno con `DEPENDENCY_HEAD` y `archived_at IS NULL` por dependencia,
 * y aquí hay exactamente uno.
 */
const STAFF = [
	{ role: "DEPENDENCY_HEAD", first: "Laura", last: "Mendoza", job: "Titular" },
	{
		role: "DEPENDENCY_DEPUTY",
		first: "Carlos",
		last: "Ibarra",
		job: "Enlace de capacitación",
	},
	{ role: "USER", first: "Diana", last: "Rojas", job: "Analista" },
	{ role: "USER", first: "Miguel", last: "Santos", job: "Inspector" },
] as const;

export async function seedOrganization(
	prisma: PrismaClient,
	password: string,
): Promise<Seeded> {
	const unassigned = await prisma.dependency.create({
		data: { name: UNASSIGNED_DEPENDENCY },
	});

	await prisma.dependency.create({
		data: { ...ARCHIVED_DEPENDENCY, archivedAt: new Date() },
	});

	let userCount = 0;

	// El superadministrador es el único interno SIN dependencia: su alcance es
	// global y no administra una unidad concreta. El CHECK de la base lo exime
	// justamente por eso.
	await prisma.user.create({
		data: {
			email: "super@instituto.gob.mx",
			password,
			firstName: "Renata",
			lastName: "Vega",
			role: "SUPERADMIN",
			employeeNumber: "EMP-1000",
			jobTitle: "Superadministradora de la plataforma",
		},
	});
	userCount += 1;

	for (const [index, dependency] of ACTIVE_DEPENDENCIES.entries()) {
		const created = await prisma.dependency.create({
			data: { name: dependency.name, acronym: dependency.acronym },
		});

		for (const [position, person] of STAFF.entries()) {
			await prisma.user.create({
				data: {
					// El correo lleva el slug de la dependencia para que dos personas con
					// el mismo puesto en distintas unidades no choquen contra el índice
					// único del correo.
					email: `${person.first.toLowerCase()}.${dependency.slug}@instituto.gob.mx`,
					password,
					firstName: person.first,
					lastName: person.last,
					role: person.role,
					// Numeración estable por dependencia: EMP-1101, EMP-1102… Así el
					// número dice de dónde es y no choca con el de otra unidad.
					employeeNumber: `EMP-${11 + index}${String(position + 1).padStart(2, "0")}`,
					jobTitle: person.job,
					dependencyId: created.id,
				},
			});
			userCount += 1;
		}
	}

	return {
		unassignedId: unassigned.id,
		// Las dos activas, la desactivada y la de acogida.
		dependencies: ACTIVE_DEPENDENCIES.length + 2,
		users: userCount,
	};
}
