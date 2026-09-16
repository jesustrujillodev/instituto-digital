import type { PrismaClient } from "@prisma/client";

/**
 * Capacitadores y grupos (PRD-02).
 *
 * Se apoya en las cuentas que siembra `seed-organization`: se buscan por correo
 * en vez de recibirlas como parámetro para que los dos archivos sigan siendo
 * independientes, y porque los correos son deterministas.
 *
 * Lo que la semilla tiene que dejar demostrado:
 * - Que los roles se ACUMULAN: el perfil va sobre un auxiliar, no sobre un rol
 *   propio.
 * - Que un participante sin más también entra al catálogo si tiene perfil.
 * - Que un perfil desactivado desaparece del catálogo activo sin borrar nada.
 * - Que un externo existe sin dependencia ni número de empleado.
 * - Los dos estados de la pantalla de grupos: con miembros y vacío.
 */

type Seeded = {
	profiles: number;
	externals: number;
	groups: number;
};

const EXTERNAL_TRAINERS = [
	{
		email: "elena.torres@universidad.mx",
		firstName: "Elena",
		lastName: "Torres",
		phone: "5512345678",
		specialty: "Transparencia y acceso a la información",
		institution: "Universidad Autónoma del Estado",
		bio: "Veinte años acompañando a gobiernos locales en materia de transparencia.",
	},
	{
		email: "raul.beltran@consultoria.mx",
		firstName: "Raúl",
		lastName: "Beltrán",
		phone: null,
		specialty: "Protección civil",
		institution: "Consultoría Beltrán y Asociados",
		bio: null,
	},
] as const;

/** Cuenta interna sobre la que se activa un perfil, buscada por su correo. */
const byEmail = async (prisma: PrismaClient, email: string) => {
	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, dependencyId: true },
	});

	if (!user) throw new Error(`La semilla esperaba la cuenta ${email}`);

	return user;
};

export async function seedTrainers(
	prisma: PrismaClient,
	password: string,
): Promise<Seeded> {
	// Un AUXILIAR con perfil: es el caso que demuestra que los roles se acumulan
	// y que el perfil no entra en la tupla `ROLES`.
	const deputy = await byEmail(prisma, "carlos.sop@instituto.gob.mx");
	await prisma.trainerProfile.create({
		data: {
			userId: deputy.id,
			specialty: "Gestión de obra pública",
			bio: "Coordina el programa anual de capacitación de la secretaría.",
		},
	});

	// Un PARTICIPANTE con perfil: entra al catálogo sin administrar nada, que es
	// lo que hace falta para probar el guard que no depende del rol.
	const participant = await byEmail(prisma, "diana.sds@instituto.gob.mx");
	await prisma.trainerProfile.create({
		data: { userId: participant.id, specialty: "Atención ciudadana" },
	});

	// Un perfil DESACTIVADO, para poder comprobar que no aparece en el catálogo
	// activo y que la cuenta sigue intacta.
	const retired = await byEmail(prisma, "miguel.sop@instituto.gob.mx");
	await prisma.trainerProfile.create({
		data: {
			userId: retired.id,
			specialty: "Supervisión de obra",
			archivedAt: new Date(),
		},
	});

	// Los externos se crean por el mismo camino que la aplicación: cuenta y
	// perfil en una sola transacción. Un externo sin perfil violaría §4 del
	// alcance y la base no puede impedirlo.
	for (const trainer of EXTERNAL_TRAINERS) {
		await prisma.$transaction(async (tx) => {
			const user = await tx.user.create({
				data: {
					email: trainer.email,
					password,
					firstName: trainer.firstName,
					lastName: trainer.lastName,
					phone: trainer.phone,
					role: "USER",
					type: "EXTERNAL",
				},
			});

			await tx.trainerProfile.create({
				data: {
					userId: user.id,
					specialty: trainer.specialty,
					institution: trainer.institution,
					bio: trainer.bio,
				},
			});
		});
	}

	// Dos grupos en la misma dependencia: uno con miembros y otro vacío, para que
	// la pantalla tenga sus dos estados desde el primer arranque.
	const head = await byEmail(prisma, "laura.sop@instituto.gob.mx");
	if (head.dependencyId === null) {
		throw new Error("La semilla esperaba a la titular con dependencia");
	}

	const withMembers = await prisma.group.create({
		data: {
			dependencyId: head.dependencyId,
			name: "Mandos medios",
			description: "Personal con gente a cargo dentro de la secretaría.",
		},
	});

	await prisma.group.create({
		data: {
			dependencyId: head.dependencyId,
			name: "Brigadistas",
			description: "Todavía sin integrantes.",
		},
	});

	// Los miembros son de la dependencia DEL GRUPO: es la regla que el catálogo
	// de candidatos impone y que el servicio vuelve a comprobar.
	const members = await prisma.user.findMany({
		where: { dependencyId: head.dependencyId, type: "INTERNAL" },
		select: { id: true },
	});

	await prisma.groupMember.createMany({
		data: members.map((member) => ({
			groupId: withMembers.id,
			userId: member.id,
			addedById: head.id,
		})),
	});

	return {
		profiles: 3,
		externals: EXTERNAL_TRAINERS.length,
		groups: 2,
	};
}
