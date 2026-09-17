import type { PrismaClient } from "@prisma/client";

/**
 * Plan anual (PRD-07).
 *
 * Obras Públicas tiene un plan 2026 con una línea en cada estado —dos vinculadas
 * a los cursos que sembró PRD-06— y un plan 2025 que ya es de solo lectura.
 * Va al final: las líneas se vinculan a cursos que tienen que existir.
 */

type Seeded = { plans: number; lines: number };

const userByEmail = async (prisma: PrismaClient, email: string) => {
	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, dependencyId: true },
	});

	if (!user?.dependencyId) {
		throw new Error(`La semilla esperaba la cuenta ${email} con dependencia`);
	}

	return { id: user.id, dependencyId: user.dependencyId };
};

const courseByTitle = async (
	prisma: PrismaClient,
	title: string,
	dependencyId: number,
) => {
	const course = await prisma.course.findFirst({
		where: { title, dependencyId },
		select: { id: true },
	});

	if (!course) throw new Error(`La semilla esperaba el curso "${title}"`);
	return course.id;
};

export async function seedAnnualPlan(prisma: PrismaClient): Promise<Seeded> {
	const head = await userByEmail(prisma, "laura.sop@instituto.gob.mx");
	const deputy = await userByEmail(prisma, "carlos.sop@instituto.gob.mx");

	const plan2026 = await prisma.annualPlan.create({
		data: {
			dependencyId: head.dependencyId,
			fiscalYear: 2026,
			createdById: deputy.id,
		},
	});

	const line = (
		title: string,
		plannedMonth: number,
		extra: Partial<{
			plannedModality: "IN_PERSON" | "ONLINE" | "HYBRID";
			estimatedDuration: string;
			targetAudience: string;
			notes: string;
			cancelledAt: Date;
			cancelledById: number;
		}> = {},
	) =>
		prisma.planLine.create({
			data: {
				planId: plan2026.id,
				title,
				plannedMonth,
				createdById: deputy.id,
				...extra,
			},
			select: { id: true },
		});

	const firstAid = await line("Primeros auxilios", 8, {
		plannedModality: "IN_PERSON",
		estimatedDuration: "2 sesiones",
		targetAudience: "Brigadistas",
	});
	const safety = await line("Seguridad en obra", 9, {
		plannedModality: "HYBRID",
		estimatedDuration: "3 sesiones",
		targetAudience: "Residentes y supervisores",
	});
	await line("Presupuestos de obra pública", 10, {
		plannedModality: "ONLINE",
		estimatedDuration: "4 semanas",
		targetAudience: "Personal administrativo",
		notes: "Buscar capacitador externo",
	});
	await line("Topografía básica", 11, {
		plannedModality: "IN_PERSON",
		cancelledAt: new Date("2026-08-20T17:00:00.000Z"),
		cancelledById: head.id,
	});

	await prisma.course.update({
		where: {
			id: await courseByTitle(prisma, "Primeros auxilios", head.dependencyId),
		},
		data: { planLineId: firstAid.id },
	});
	await prisma.course.update({
		where: {
			id: await courseByTitle(prisma, "Seguridad en obra", head.dependencyId),
		},
		data: { planLineId: safety.id },
	});

	const plan2025 = await prisma.annualPlan.create({
		data: {
			dependencyId: head.dependencyId,
			fiscalYear: 2025,
			createdById: head.id,
		},
	});
	await prisma.planLine.create({
		data: {
			planId: plan2025.id,
			title: "Normatividad de obra pública",
			plannedMonth: 5,
			plannedModality: "ONLINE",
			createdById: head.id,
		},
	});

	return { plans: 2, lines: 5 };
}
