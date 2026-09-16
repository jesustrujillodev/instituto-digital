import type { Prisma, PrismaClient } from "@prisma/client";
import { endOfZonedDay, zonedInputToUtc } from "@/lib/date-utils";

/**
 * Inscripción e invitaciones (PRD-04).
 *
 * Deja un curso por caso del recorrido de VERIFICACION-MANUAL.md: por
 * invitación con cupo casi lleno, lleno, con la inscripción vencida y ya
 * empezado. Las fechas suponen que hoy cae entre el 14 de septiembre y el 15 de
 * octubre de 2026.
 */

type Seeded = { courses: number; enrollments: number; groups: number };

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
	venue: "Sala de capacitación, edificio B",
	link: null,
});

const enrolled = (
	account: { id: number; dependencyId: number },
	origin: "SELF" | "INVITATION",
): Prisma.EnrollmentCreateWithoutCourseInput => ({
	user: { connect: { id: account.id } },
	dependency: { connect: { id: account.dependencyId } },
	actedBy: { connect: { id: account.id } },
	origin,
	status: "ENROLLED",
	enrolledAt: new Date(),
	...(origin === "INVITATION" && {
		invitedAt: new Date(),
		respondedAt: new Date(),
	}),
});

export async function seedEnrollments(prisma: PrismaClient): Promise<Seeded> {
	const headSop = await byEmail(prisma, "laura.sop@instituto.gob.mx");
	const trainerSop = await byEmail(prisma, "carlos.sop@instituto.gob.mx");
	const dianaSop = await byEmail(prisma, "diana.sop@instituto.gob.mx");
	const miguelSop = await byEmail(prisma, "miguel.sop@instituto.gob.mx");
	const headSds = await byEmail(prisma, "laura.sds@instituto.gob.mx");
	const carlosSds = await byEmail(prisma, "carlos.sds@instituto.gob.mx");
	const trainerSds = await byEmail(prisma, "diana.sds@instituto.gob.mx");
	const miguelSds = await byEmail(prisma, "miguel.sds@instituto.gob.mx");

	const external = await prisma.user.findUniqueOrThrow({
		where: { email: "elena.torres@universidad.mx" },
		select: { id: true },
	});

	const sop = headSop.dependencyId;
	const sds = headSds.dependencyId;
	const published = { status: "PUBLISHED" as const, publishedAt: new Date() };

	const group = await prisma.group.create({
		data: {
			dependencyId: sds,
			name: "Enlaces administrativos",
			description: "Enlaces de cada área ante la secretaría.",
		},
	});
	await prisma.groupMember.createMany({
		data: [carlosSds, miguelSds, headSds].map((member) => ({
			groupId: group.id,
			userId: member.id,
			addedById: headSds.id,
		})),
	});

	await prisma.course.create({
		data: {
			...published,
			dependencyId: sds,
			createdById: trainerSds.id,
			title: "Protección civil básica",
			modality: "IN_PERSON",
			access: "INVITATION",
			capacity: 2,
			sessions: { create: [session("2026-10-22", "09:00", "12:00")] },
			trainers: { create: [{ userId: trainerSds.id }] },
			enrollments: { create: [enrolled(carlosSds, "INVITATION")] },
		},
	});

	await prisma.course.create({
		data: {
			...published,
			dependencyId: sop,
			createdById: headSop.id,
			title: "Redacción de oficios",
			modality: "IN_PERSON",
			access: "PUBLIC",
			capacity: 1,
			sessions: { create: [session("2026-10-28", "10:00", "13:00")] },
			trainers: { create: [{ userId: trainerSop.id }] },
			enrollments: { create: [enrolled(dianaSop, "SELF")] },
		},
	});

	await prisma.course.create({
		data: {
			...published,
			dependencyId: sop,
			createdById: headSop.id,
			title: "Ética pública",
			modality: "IN_PERSON",
			access: "PUBLIC",
			enrollmentDeadline: endOfZonedDay("2026-09-10"),
			sessions: { create: [session("2026-10-15", "09:00", "11:00")] },
			trainers: { create: [{ userId: trainerSop.id }] },
		},
	});

	await prisma.course.create({
		data: {
			...published,
			dependencyId: sop,
			createdById: headSop.id,
			title: "Inducción institucional",
			modality: "IN_PERSON",
			access: "PUBLIC",
			sessions: {
				create: [
					session("2026-09-14", "09:00", "11:00"),
					session("2026-09-28", "09:00", "11:00"),
				],
			},
			trainers: { create: [{ userId: external.id }] },
			enrollments: { create: [enrolled(miguelSop, "SELF")] },
		},
	});

	return { courses: 4, enrollments: 3, groups: 1 };
}
