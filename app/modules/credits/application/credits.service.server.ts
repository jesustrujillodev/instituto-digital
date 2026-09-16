import { zonedYearOf } from "@/lib/date-utils";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { resolveScope } from "@/shared/auth/scope.rules";
import type { ICradle } from "@/shared/di/container.types";
import { ok, toPaginationMeta } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { CREDIT_LIST_DEFAULTS } from "../domain/credit.config";
import {
	CreditDependencyNotFoundError,
	CreditForbiddenScopeError,
} from "../domain/credit.errors";
import { summarizeMine } from "../domain/credit.mapper";
import type { ICreditService } from "../domain/credit.service";
import type {
	CreditDependency,
	CreditsOverview,
	CreditsOverviewQueryDto,
	MyCreditsQueryDto,
} from "../domain/credit.types";

type Dependencies = {
	creditRepository: ICradle["creditRepository"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createCreditService = ({
	creditRepository,
	clock,
	logger,
}: Dependencies): ICreditService => {
	const run = createOperationRunner(logger.child({ module: "credits" }));

	const staffOf = async (
		dependency: CreditDependency,
		query: CreditsOverviewQueryDto,
		fiscalYear: number,
		canChangeDependency: boolean,
	) => {
		const page = query.page ?? CREDIT_LIST_DEFAULTS.page;
		const pageSize = query.pageSize ?? CREDIT_LIST_DEFAULTS.pageSize;
		const filters = {
			dependencyId: dependency.id,
			fiscalYear,
			search: query.search,
		};

		const [rows, total] = await Promise.all([
			creditRepository.findStaff({ ...filters, page, pageSize }),
			creditRepository.countStaff(filters),
		]);

		return ok(
			{
				view: "staff" as const,
				fiscalYear,
				dependency: {
					documentId: dependency.documentId,
					name: dependency.name,
				},
				canChangeDependency,
				rows,
			},
			{ pagination: toPaginationMeta({ page, pageSize, total }) },
		);
	};

	return {
		async listMine(query: MyCreditsQueryDto, actor: AuthContext) {
			return run("listMine", async () => {
				const credits = await creditRepository.findMine(actor.userId);

				return ok(
					summarizeMine(credits, query.fiscalYear ?? zonedYearOf(clock.now())),
				);
			});
		},

		async listOverview(query: CreditsOverviewQueryDto, actor: AuthContext) {
			return run<CreditsOverview>("listOverview", async () => {
				const scope = resolveScope(actor);
				const fiscalYear = query.fiscalYear ?? zonedYearOf(clock.now());

				switch (scope.kind) {
					case "global": {
						if (!query.dependency) {
							return ok({
								view: "dependencies" as const,
								fiscalYear,
								rows: await creditRepository.summarizeByDependency(fiscalYear),
							});
						}
						const dependency = await creditRepository.findDependency(
							query.dependency,
						);
						if (!dependency) throw new CreditDependencyNotFoundError();

						return staffOf(dependency, query, fiscalYear, true);
					}
					case "dependency": {
						// El filtro de la URL se ignora: fuera del alcance global no amplía nada.
						const own = await creditRepository.findDependencyById(
							scope.dependencyId,
						);
						if (!own) throw new CreditDependencyNotFoundError();

						return staffOf(own, query, fiscalYear, false);
					}
					case "self":
					case "none":
						throw new CreditForbiddenScopeError();
					default: {
						const exhaustive: never = scope;
						return exhaustive;
					}
				}
			});
		},
	};
};
