export { action } from "./index.action";
export { loader } from "./index.loader";

import { CalendarRange, Plus } from "lucide-react";
import { useMemo } from "react";
import { useFetcher, useNavigate, useSearchParams } from "react-router";
import { DataTable } from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { PlanProgressBar } from "../../components/plan-badges";
import type { PlanSummary } from "../../domain/annual-plan.types";
import {
	DEPENDENCY_PARAM,
	INTENT_FIELD,
	PLAN_INTENTS,
	type PlanActionData,
	YEAR_FIELD,
} from "../../utils/parse-plan-form-data";
import type { Route } from "./+types/index";

const ALL = "all";

type PlanRow = PlanSummary & { id: string };

export const handle = {
	breadcrumb: () => [{ label: "Plan anual" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Plan anual" }];
}

export default function PlanAnualPage({ loaderData }: Route.ComponentProps) {
	const {
		data: {
			plans,
			canManage,
			creatableYears,
			canFilterByDependency,
			dependency,
			dependencies,
		},
	} = loaderData;
	const navigate = useNavigate();
	const [, setSearchParams] = useSearchParams();
	const fetcher = useFetcher<PlanActionData>();
	useFetcherToast(fetcher);

	const rows = useMemo<PlanRow[]>(
		() => plans.map((plan) => ({ ...plan, id: plan.documentId })),
		[plans],
	);

	const columns = useMemo(
		() => [
			columnHelpers.custom<PlanRow>("fiscalYear", "Ejercicio", (plan) => (
				<div className="flex items-center gap-2">
					<span className="font-medium">{plan.fiscalYear}</span>
					{plan.readOnly && <Badge variant="outline">Solo lectura</Badge>}
				</div>
			)),
			...(canFilterByDependency
				? [columnHelpers.text<PlanRow>("dependencyName", "Dependencia")]
				: []),
			columnHelpers.custom<PlanRow>("progress", "Avance", (plan) => (
				<div className="min-w-48">
					<PlanProgressBar progress={plan.progress} />
				</div>
			)),
		],
		[canFilterByDependency],
	);

	const createPlan = (year: number) =>
		fetcher.submit(
			{ [INTENT_FIELD]: PLAN_INTENTS.createPlan, [YEAR_FIELD]: String(year) },
			{ method: "post" },
		);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Plan anual"
				description="Los cursos que la dependencia prevé dar en el año. Orienta, no restringe: un curso puede existir sin línea de plan."
				actions={
					canManage &&
					creatableYears.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{creatableYears.map((year) => (
								<Button
									key={year}
									onClick={() => createPlan(year)}
									disabled={fetcher.state !== "idle"}
								>
									<Plus className="h-4 w-4" />
									Crear plan {year}
								</Button>
							))}
						</div>
					)
				}
				collapseActionsOnMobile
			/>

			{canFilterByDependency && (
				<div className="mb-4 flex justify-end">
					<Select
						value={dependency || ALL}
						onValueChange={(value) =>
							setSearchParams(
								value === ALL ? {} : { [DEPENDENCY_PARAM]: value },
								{ preventScrollReset: true },
							)
						}
					>
						<SelectTrigger className="w-56">
							<SelectValue placeholder="Dependencia" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL}>Todas las dependencias</SelectItem>
							{dependencies.map((option) => (
								<SelectItem key={option.documentId} value={option.documentId}>
									{option.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={rows}
					columns={columns}
					emptyState={{
						icon: CalendarRange,
						title: "Sin planes",
						description: canManage
							? "Crea el plan del ejercicio cuando lo necesites."
							: "Ninguna dependencia ha creado su plan todavía.",
					}}
					mobileCard={{
						title: (plan) => `Plan ${plan.fiscalYear}`,
						description: (plan) => plan.dependencyName,
						content: (plan) => <PlanProgressBar progress={plan.progress} />,
					}}
					onRowClick={(plan) =>
						navigate(`/dashboard/plan-anual/${plan.documentId}`)
					}
				/>
			</div>
		</div>
	);
}
