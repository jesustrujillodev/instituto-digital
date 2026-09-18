import type { Prisma, PrismaClient } from "@prisma/client";
import { zonedInputToUtc } from "@/lib/date-utils";

/**
 * Impartición, créditos y valoración (PRD-06).
 *
 * Dos cursos de Obras Públicas que imparte `carlos.sop` (auxiliar y capacitador):
 * - "Seguridad en obra", publicado, con las tres sesiones ya pasadas, lista
 *   pasada y un resultado aún pendiente: no se puede finalizar hasta capturarlo.
 * - "Primeros auxilios", finalizado: `diana.sop` completó y tiene su crédito,
 *   `miguel.sds` asistió a una de dos sesiones, así que no completó pero sí
 *   puede valorar. Hay dos valoraciones para la ficha del capacitador.
 */

type Seeded = {
	courses: number;
	credits: number;
	ratings: number;
	evaluations: number;
};

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
	venue: "Aula 2, edificio de Obras Públicas",
	link: "https://meet.example.com/seguridad-en-obra",
});

type Person = { id: number; dependencyId: number };

const enrolled = (person: Person, actorId: number, at: Date) => ({
	user: { connect: { id: person.id } },
	dependency: { connect: { id: person.dependencyId } },
	actedBy: { connect: { id: actorId } },
	origin: "ASSIGNED" as const,
	status: "ENROLLED" as const,
	enrolledAt: at,
});

export async function seedTeaching(prisma: PrismaClient): Promise<Seeded> {
	const headSop = await byEmail(prisma, "laura.sop@instituto.gob.mx");
	const trainerSop = await byEmail(prisma, "carlos.sop@instituto.gob.mx");
	const dianaSop = await byEmail(prisma, "diana.sop@instituto.gob.mx");
	const miguelSop = await byEmail(prisma, "miguel.sop@instituto.gob.mx");
	const miguelSds = await byEmail(prisma, "miguel.sds@instituto.gob.mx");
	const now = new Date();

	const safety = await prisma.course.create({
		data: {
			status: "PUBLISHED",
			publishedAt: now,
			dependencyId: headSop.dependencyId,
			createdById: headSop.id,
			title: "Seguridad en obra",
			modality: "HYBRID",
			access: "PUBLIC",
			capacity: 20,
			requiresEvaluation: true,
			sessions: {
				create: [
					session("2026-09-01", "09:00", "12:00"),
					session("2026-09-02", "09:00", "12:00"),
					session("2026-09-03", "09:00", "12:00"),
				],
			},
			trainers: { create: [{ userId: trainerSop.id }] },
			enrollments: {
				create: [
					{
						...enrolled(dianaSop, headSop.id, now),
						result: "PASSED",
						grade: 92,
						resultRecordedBy: { connect: { id: trainerSop.id } },
						resultRecordedAt: now,
					},
					enrolled(miguelSop, headSop.id, now),
				],
			},
		},
		select: {
			id: true,
			sessions: { select: { id: true }, orderBy: { startsAt: "asc" } },
		},
	});

	const mark = (sessionId: number, userId: number, attended: boolean) => ({
		sessionId,
		userId,
		attended,
		recordedById: trainerSop.id,
		recordedAt: now,
	});

	await prisma.courseAttendance.createMany({
		data: safety.sessions.flatMap((row, index) => [
			mark(row.id, dianaSop.id, true),
			mark(row.id, miguelSop.id, index !== 1),
		]),
	});

	// Dos evaluaciones: una atada a la sesión 2 y otra sin día, como el proyecto
	// final. Lo capturado es interno: no sale en "Mis cursos" (§6.8).
	await prisma.courseEvaluation.create({
		data: {
			courseId: safety.id,
			sessionId: safety.sessions[1].id,
			title: "Práctica de campo",
			createdById: trainerSop.id,
			results: {
				create: [
					{
						userId: dianaSop.id,
						passed: true,
						note: "Aplicó el protocolo sin ayuda.",
						recordedById: trainerSop.id,
						recordedAt: now,
					},
					{
						userId: miguelSop.id,
						passed: false,
						note: "No se presentó a la práctica.",
						recordedById: trainerSop.id,
						recordedAt: now,
					},
				],
			},
		},
	});

	await prisma.courseEvaluation.create({
		data: {
			courseId: safety.id,
			title: "Proyecto final",
			createdById: trainerSop.id,
			results: {
				create: [
					{
						userId: miguelSop.id,
						passed: null,
						note: "Falta que entregue el reporte.",
						recordedById: trainerSop.id,
						recordedAt: now,
					},
				],
			},
		},
	});

	const firstAid = await prisma.course.create({
		data: {
			status: "FINISHED",
			publishedAt: zonedInputToUtc("2026-08-01", "09:00"),
			finishedAt: zonedInputToUtc("2026-08-13", "18:00"),
			dependencyId: headSop.dependencyId,
			createdById: headSop.id,
			title: "Primeros auxilios",
			modality: "IN_PERSON",
			access: "PUBLIC",
			sessions: {
				create: [
					{ ...session("2026-08-11", "16:00", "18:00"), link: null },
					{ ...session("2026-08-13", "16:00", "18:00"), link: null },
				],
			},
			trainers: { create: [{ userId: trainerSop.id }] },
			enrollments: {
				create: [
					{ ...enrolled(dianaSop, headSop.id, now), completed: true },
					enrolled(miguelSds, headSop.id, now),
				],
			},
		},
		select: {
			id: true,
			sessions: { select: { id: true }, orderBy: { startsAt: "asc" } },
		},
	});

	await prisma.courseAttendance.createMany({
		data: firstAid.sessions.flatMap((row, index) => [
			mark(row.id, dianaSop.id, true),
			mark(row.id, miguelSds.id, index === 0),
		]),
	});

	await prisma.credit.create({
		data: {
			userId: dianaSop.id,
			courseId: firstAid.id,
			dependencyId: dianaSop.dependencyId,
			fiscalYear: 2026,
			grantedAt: zonedInputToUtc("2026-08-13", "18:00"),
			grantedById: trainerSop.id,
		},
	});

	await prisma.courseRating.createMany({
		data: [
			{
				courseId: firstAid.id,
				userId: dianaSop.id,
				score: 5,
				comment: "Muy práctico, con ejercicios reales.",
			},
			{ courseId: firstAid.id, userId: miguelSds.id, score: 3 },
		],
	});

	return { courses: 2, credits: 1, ratings: 2, evaluations: 2 };
}
