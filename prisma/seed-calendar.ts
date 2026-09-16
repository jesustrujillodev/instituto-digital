import type { Prisma, PrismaClient } from "@prisma/client";
import { zonedInputToUtc } from "@/lib/date-utils";

/**
 * Calendario (PRD-05).
 *
 * El calendario no tiene tablas: lo demás de la semilla ya cubre casi todos
 * sus casos. Este curso añade los que faltaban:
 * - Una invitación pendiente de un participante sin otros roles (`miguel.sop`),
 *   marcada distinto a lo inscrito.
 * - Personal de SOP (`diana.sop`) inscrito en un curso de SEDESOL, que es lo que
 *   `laura.sop` ve al activar "mi personal".
 * - Una sesión antes y otra después del fin del horario de verano (1 nov).
 *
 * Es por invitación a propósito: un curso público abierto cambiaría la lista de
 * "Cursos disponibles" que da por buena el recorrido de PRD-04.
 */

type Seeded = { courses: number };

const byEmail = async (prisma: PrismaClient, email: string) => {
	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, dependencyId: true },
	});

	if (!user?.dependencyId) {
		throw new Error(`La semilla esperaba la cuenta ${email} con dependencia`);
	}

	return { id: user.id, dependencyId: user.dependencyId };
};

const session = (
	date: string,
	startTime: string,
	endTime: string,
): Prisma.CourseSessionCreateWithoutCourseInput => ({
	startsAt: zonedInputToUtc(date, startTime),
	endsAt: zonedInputToUtc(date, endTime),
	venue: "Sala de juntas, planta alta",
	link: "https://meet.example.com/archivo-transparencia",
});

export async function seedCalendar(prisma: PrismaClient): Promise<Seeded> {
	const headSds = await byEmail(prisma, "laura.sds@instituto.gob.mx");
	const trainerSds = await byEmail(prisma, "diana.sds@instituto.gob.mx");
	const miguelSop = await byEmail(prisma, "miguel.sop@instituto.gob.mx");
	const dianaSop = await byEmail(prisma, "diana.sop@instituto.gob.mx");
	const now = new Date();

	await prisma.course.create({
		data: {
			status: "PUBLISHED",
			publishedAt: now,
			dependencyId: headSds.dependencyId,
			createdById: trainerSds.id,
			title: "Archivo y transparencia",
			modality: "HYBRID",
			access: "INVITATION",
			capacity: 10,
			sessions: {
				create: [
					session("2026-10-27", "17:00", "19:00"),
					session("2026-11-03", "17:00", "19:00"),
				],
			},
			trainers: { create: [{ userId: trainerSds.id }] },
			enrollments: {
				create: [
					{
						user: { connect: { id: dianaSop.id } },
						dependency: { connect: { id: dianaSop.dependencyId } },
						actedBy: { connect: { id: dianaSop.id } },
						origin: "INVITATION",
						status: "ENROLLED",
						invitedAt: now,
						respondedAt: now,
						enrolledAt: now,
					},
					{
						user: { connect: { id: miguelSop.id } },
						dependency: { connect: { id: miguelSop.dependencyId } },
						actedBy: { connect: { id: trainerSds.id } },
						origin: "INVITATION",
						status: "INVITED",
						invitedAt: now,
					},
				],
			},
		},
	});

	return { courses: 1 };
}
