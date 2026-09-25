import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import type { PlanScopeWhere } from "../domain/annual-plan.access";
import {
	AnnualPlanAlreadyExistsError,
	AnnualPlanLineHasCoursesError,
} from "../domain/annual-plan.errors";
import type { IAnnualPlanRepository } from "../domain/annual-plan.repository";
import type { PlanRef } from "../domain/annual-plan.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const LINE_SELECT = {
	id: true,
	documentId: true,
	title: true,
	plannedMonth: true,
	plannedModality: true,
	estimatedDuration: true,
	targetAudience: true,
	notes: true,
	cancelledAt: true,
	courses: {
		orderBy: { createdAt: "desc" },
		select: { documentId: true, title: true, status: true, format: true },
	},
} satisfies Prisma.PlanLineSelect;

const PLAN_REF_SELECT = {
	id: true,
	documentId: true,
	dependencyId: true,
	fiscalYear: true,
	dependency: { select: { name: true } },
} satisfies Prisma.AnnualPlanSelect;

const PLAN_SELECT = {
	...PLAN_REF_SELECT,
	lines: {
		orderBy: [{ plannedMonth: "asc" }, { createdAt: "asc" }],
		select: LINE_SELECT,
	},
} satisfies Prisma.AnnualPlanSelect;

const toPlanRef = ({
	dependency,
	...plan
}: Prisma.AnnualPlanGetPayload<{
	select: typeof PLAN_REF_SELECT;
}>): PlanRef => ({
	...plan,
	dependencyName: dependency.name,
});

// El filtro de dominio usa arreglos `readonly`, que Prisma no acepta tal cual.
const asWhere = (where: PlanScopeWhere) =>
	where as unknown as Prisma.AnnualPlanWhereInput;

const isKnownError = (error: unknown, code: string) =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

export const createAnnualPlanRepository = ({
	prisma,
}: Dependencies): IAnnualPlanRepository => ({
	async findPlans(where, { dependencyDocumentId, fiscalYear, fromYear }) {
		const plans = await prisma.annualPlan.findMany({
			where: {
				AND: [
					asWhere(where),
					...(dependencyDocumentId
						? [{ dependency: { documentId: dependencyDocumentId } }]
						: []),
					...(fiscalYear ? [{ fiscalYear }] : []),
					...(fromYear ? [{ fiscalYear: { gte: fromYear } }] : []),
				],
			},
			orderBy: [{ fiscalYear: "desc" }, { dependency: { name: "asc" } }],
			select: PLAN_SELECT,
		});

		return plans.map(({ lines, ...plan }) => ({ ...toPlanRef(plan), lines }));
	},

	async findPlan(documentId, where) {
		const plan = await prisma.annualPlan.findFirst({
			where: { AND: [{ documentId }, asWhere(where)] },
			select: PLAN_SELECT,
		});
		if (!plan) return null;

		const { lines, ...ref } = plan;
		return { ...toPlanRef(ref), lines };
	},

	async createPlan(data) {
		try {
			return await prisma.annualPlan.create({
				data,
				select: { documentId: true },
			});
		} catch (error) {
			if (isKnownError(error, "P2002")) {
				throw new AnnualPlanAlreadyExistsError(data.fiscalYear);
			}
			throw error;
		}
	},

	async findLine(documentId, where) {
		const line = await prisma.planLine.findFirst({
			where: { documentId, plan: asWhere(where) },
			select: { ...LINE_SELECT, plan: { select: PLAN_REF_SELECT } },
		});
		if (!line) return null;

		return { ...line, plan: toPlanRef(line.plan) };
	},

	async createLine(planId, data, createdById) {
		await prisma.planLine.create({ data: { ...data, planId, createdById } });
	},

	async updateLine(lineId, data) {
		await prisma.planLine.update({ where: { id: lineId }, data });
	},

	async setLineCancelled(lineId, cancellation) {
		await prisma.planLine.update({
			where: { id: lineId },
			data: {
				cancelledAt: cancellation?.at ?? null,
				cancelledById: cancellation?.actorId ?? null,
			},
		});
	},

	async deleteLine(lineId) {
		try {
			await prisma.planLine.delete({ where: { id: lineId } });
		} catch (error) {
			// La FK RESTRICT desde `courses` es la garantía: la comprobación del
			// servicio solo da el mensaje antes de llegar aquí.
			if (isKnownError(error, "P2003"))
				throw new AnnualPlanLineHasCoursesError();
			throw error;
		}
	},

	async lockLineForCourse(documentId) {
		await prisma.$queryRaw`SELECT id FROM "org"."plan_lines" WHERE "documentId" = ${documentId}::uuid FOR UPDATE`;

		return prisma.planLine.findUnique({
			where: { documentId },
			select: {
				id: true,
				cancelledAt: true,
				plan: { select: { dependencyId: true, fiscalYear: true } },
				courses: { select: { status: true } },
			},
		});
	},
});
