import { prisma } from "@/core/db.server";

/**
 * Filas mínimas para las pruebas de integración. Cada llamada usa un sufijo
 * único, y `cleanup` borra solo lo que esta instancia creó, en el orden que
 * piden las FK RESTRICT.
 */
export const createDbFixtures = () => {
	const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	let sequence = 0;
	const unique = (label: string) => `${label}-${tag}-${++sequence}`;
	const created = {
		dependencies: [] as number[],
		users: [] as number[],
		courses: [] as number[],
		plans: [] as number[],
	};

	const dependency = async () => {
		const row = await prisma.dependency.create({
			data: { name: unique("Dependencia") },
		});
		created.dependencies.push(row.id);
		return row;
	};

	const user = async (data: { role?: string; dependencyId?: number } = {}) => {
		const dependencyId = data.dependencyId ?? (await dependency()).id;
		const row = await prisma.user.create({
			data: {
				email: `${unique("persona")}@idc.test`,
				role: data.role ?? "USER",
				dependencyId,
				employeeNumber: unique("E"),
			},
		});
		created.users.push(row.id);
		return row;
	};

	const course = async () => {
		const author = await user({ role: "DEPENDENCY_HEAD" });
		const row = await prisma.course.create({
			data: {
				title: unique("Curso"),
				modality: "ONLINE",
				access: "PUBLIC",
				dependencyId: author.dependencyId as number,
				createdById: author.id,
			},
		});
		created.courses.push(row.id);
		return row;
	};

	const planLine = async () => {
		const author = await user({ role: "DEPENDENCY_HEAD" });
		const plan = await prisma.annualPlan.create({
			data: {
				dependencyId: author.dependencyId as number,
				fiscalYear: 2026,
				createdById: author.id,
			},
		});
		created.plans.push(plan.id);
		return prisma.planLine.create({
			data: {
				planId: plan.id,
				title: unique("Línea"),
				plannedMonth: 3,
				createdById: author.id,
			},
		});
	};

	const cleanup = async () => {
		await prisma.course.deleteMany({ where: { id: { in: created.courses } } });
		await prisma.planLine.deleteMany({
			where: { planId: { in: created.plans } },
		});
		await prisma.annualPlan.deleteMany({
			where: { id: { in: created.plans } },
		});
		await prisma.session.deleteMany({
			where: { userId: { in: created.users } },
		});
		await prisma.user.deleteMany({ where: { id: { in: created.users } } });
		await prisma.dependency.deleteMany({
			where: { id: { in: created.dependencies } },
		});
	};

	return { unique, dependency, user, course, planLine, cleanup };
};

/**
 * Corre `second` mientras `first` retiene su bloqueo y devuelve en qué orden
 * terminaron. `first` llama a `hold()` en cuanto tiene el bloqueo; con un
 * `FOR UPDATE` de por medio, `second` no termina hasta que `first` lo suelta:
 * `["released", "first", "second"]`.
 */
export const raceTransactions = async (
	first: (hold: () => Promise<void>) => Promise<void>,
	second: () => Promise<void>,
) => {
	const order: string[] = [];
	let release!: () => void;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	let locked!: () => void;
	const lockTaken = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const hold = async () => {
		locked();
		await released;
	};

	const firstDone = first(hold).then(() => {
		order.push("first");
	});
	await lockTaken;
	const secondDone = second().then(() => {
		order.push("second");
	});
	// Margen para que `second` llegue a la base y quede esperando el bloqueo.
	await new Promise((resolve) => setTimeout(resolve, 300));
	order.push("released");
	release();
	await Promise.all([firstDone, secondDone]);
	return order;
};
