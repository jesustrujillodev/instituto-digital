import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { type AccessScope, resolveScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { canManagePlans, planScopeWhere } from "../domain/annual-plan.access";
import {
	AnnualPlanForbiddenScopeError,
	AnnualPlanLineNotFoundError,
	AnnualPlanNotFoundError,
} from "../domain/annual-plan.errors";
import { toPlanDetail, toPlanSummary } from "../domain/annual-plan.mapper";
import {
	assertCreatableYear,
	assertLineAvailableForCourse,
	assertLineCancellable,
	assertLineDeletable,
	assertLineEditable,
	assertLineReactivable,
	assertPlanWritable,
	creatableYearsOf,
} from "../domain/annual-plan.rules";
import type { IAnnualPlanService } from "../domain/annual-plan.service";
import type {
	CreatePlanDto,
	ListPlansDto,
	PlanLineDto,
	StoredLineWithPlan,
} from "../domain/annual-plan.types";

type Dependencies = {
	annualPlanRepository: ICradle["annualPlanRepository"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createAnnualPlanService = ({
	annualPlanRepository,
	clock,
	logger,
}: Dependencies): IAnnualPlanService => {
	const run = createOperationRunner(logger.child({ module: "annual-plan" }));

	const requireManager = (actor: AuthContext) => {
		const scope = resolveScope(actor);
		if (!canManagePlans(scope)) throw new AnnualPlanForbiddenScopeError();
		return scope;
	};

	/** La línea dentro del alcance de escritura y de un plan que no ha pasado. */
	const requireWritableLine = async (
		lineDocumentId: string,
		scope: AccessScope,
	): Promise<StoredLineWithPlan> => {
		const line = await annualPlanRepository.findLine(
			lineDocumentId,
			planScopeWhere(scope),
		);
		if (!line) throw new AnnualPlanLineNotFoundError();
		assertPlanWritable(line.plan, clock.now());
		return line;
	};

	return {
		async listPlans(query: ListPlansDto, actor: AuthContext) {
			return run("listPlans", async () => {
				const scope = resolveScope(actor);
				const now = clock.now();

				const plans = await annualPlanRepository.findPlans(
					planScopeWhere(scope),
					{
						// El filtro de dependencia solo amplía algo en el alcance global.
						dependencyDocumentId:
							scope.kind === "global" ? query.dependency : undefined,
						fiscalYear: query.fiscalYear,
					},
				);
				const canManage = canManagePlans(scope);

				return ok({
					plans: plans.map((plan) => toPlanSummary(plan, now)),
					canManage,
					creatableYears: canManage
						? creatableYearsOf(
								plans.map((plan) => plan.fiscalYear),
								now,
							)
						: [],
				});
			});
		},

		async findPlan(documentId: string, actor: AuthContext) {
			return run("findPlan", async () => {
				const scope = resolveScope(actor);
				const plan = await annualPlanRepository.findPlan(
					documentId,
					planScopeWhere(scope),
				);
				if (!plan) throw new AnnualPlanNotFoundError();

				return ok(toPlanDetail(plan, canManagePlans(scope), clock.now()));
			});
		},

		async createPlan(dto: CreatePlanDto, actor: AuthContext) {
			return run("createPlan", async () => {
				const scope = requireManager(actor);
				assertCreatableYear(dto.fiscalYear, clock.now());

				return ok(
					await annualPlanRepository.createPlan({
						dependencyId: scope.dependencyId,
						fiscalYear: dto.fiscalYear,
						createdById: actor.userId,
					}),
				);
			});
		},

		async addLine(
			planDocumentId: string,
			dto: PlanLineDto,
			actor: AuthContext,
		) {
			return run("addLine", async () => {
				const scope = requireManager(actor);
				const plan = await annualPlanRepository.findPlan(
					planDocumentId,
					planScopeWhere(scope),
				);
				if (!plan) throw new AnnualPlanNotFoundError();
				assertPlanWritable(plan, clock.now());

				await annualPlanRepository.createLine(plan.id, dto, actor.userId);
				return ok(null);
			});
		},

		async updateLine(
			lineDocumentId: string,
			dto: PlanLineDto,
			actor: AuthContext,
		) {
			return run("updateLine", async () => {
				const line = await requireWritableLine(
					lineDocumentId,
					requireManager(actor),
				);
				assertLineEditable(line);

				await annualPlanRepository.updateLine(line.id, dto);
				return ok(null);
			});
		},

		async cancelLine(lineDocumentId: string, actor: AuthContext) {
			return run("cancelLine", async () => {
				const line = await requireWritableLine(
					lineDocumentId,
					requireManager(actor),
				);
				assertLineCancellable(line);

				await annualPlanRepository.setLineCancelled(line.id, {
					at: clock.now(),
					actorId: actor.userId,
				});
				return ok(null);
			});
		},

		async reactivateLine(lineDocumentId: string, actor: AuthContext) {
			return run("reactivateLine", async () => {
				const line = await requireWritableLine(
					lineDocumentId,
					requireManager(actor),
				);
				assertLineReactivable(line);

				await annualPlanRepository.setLineCancelled(line.id, null);
				return ok(null);
			});
		},

		async deleteLine(lineDocumentId: string, actor: AuthContext) {
			return run("deleteLine", async () => {
				const line = await requireWritableLine(
					lineDocumentId,
					requireManager(actor),
				);
				assertLineDeletable(line);

				await annualPlanRepository.deleteLine(line.id);
				return ok(null);
			});
		},

		async findLineForCourse(lineDocumentId: string, actor: AuthContext) {
			return run("findLineForCourse", async () => {
				const scope = requireManager(actor);
				const line = await annualPlanRepository.findLine(
					lineDocumentId,
					planScopeWhere(scope),
				);
				if (!line) throw new AnnualPlanLineNotFoundError();
				assertLineAvailableForCourse(line, line.plan, clock.now());

				return ok({
					lineDocumentId: line.documentId,
					title: line.title,
					plannedModality: line.plannedModality,
					planDocumentId: line.plan.documentId,
					fiscalYear: line.plan.fiscalYear,
				});
			});
		},
	};
};
