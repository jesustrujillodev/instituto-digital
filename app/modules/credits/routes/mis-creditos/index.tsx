export { loader } from "./index.loader";

import { Award } from "lucide-react";
import { useSearchParams } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { PageHeader } from "@/shared/components/common/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CREDIT_PARAMS } from "../../utils/credit-params";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [{ label: "Mis créditos" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Mis créditos" }];
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">{label}</span>
				<span className="font-semibold text-2xl">{value}</span>
			</CardContent>
		</Card>
	);
}

export default function MisCreditosPage({ loaderData }: Route.ComponentProps) {
	const { data } = loaderData;
	const [, setSearchParams] = useSearchParams();
	const credits = data.credits.filter(
		(credit) => credit.fiscalYear === data.fiscalYear,
	);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Mis créditos"
				description="Un crédito por cada curso completado. Cuenta para la dependencia a la que pertenecías al obtenerlo."
			/>

			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="grid flex-1 gap-3 sm:grid-cols-2">
					<Stat label={`Ejercicio ${data.fiscalYear}`} value={data.yearTotal} />
					<Stat label="Acumulado histórico" value={data.historicTotal} />
				</div>
				<Select
					value={String(data.fiscalYear)}
					onValueChange={(value) =>
						setSearchParams({ [CREDIT_PARAMS.fiscalYear]: value })
					}
				>
					<SelectTrigger className="w-40">
						<SelectValue placeholder="Ejercicio" />
					</SelectTrigger>
					<SelectContent>
						{data.years.map((year) => (
							<SelectItem key={year} value={String(year)}>
								Ejercicio {year}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{credits.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Sin créditos en {data.fiscalYear}</EmptyTitle>
						<EmptyDescription>
							Los créditos llegan solos cuando se finaliza un curso que
							completaste.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<Card>
					<CardContent>
						<ul className="flex flex-col divide-y divide-border">
							{credits.map((credit) => (
								<li
									key={credit.documentId}
									className="flex flex-wrap items-center justify-between gap-2 py-2"
								>
									<div className="flex min-w-0 items-center gap-3">
										<Award className="h-4 w-4 text-muted-foreground" />
										<div className="min-w-0">
											<p className="truncate font-medium text-sm">
												{credit.courseTitle}
											</p>
											<p className="truncate text-muted-foreground text-xs">
												Otorgado el{" "}
												{formatZonedDate(new Date(credit.grantedAt))}
											</p>
										</div>
									</div>
									<Badge variant="outline">{credit.dependencyName}</Badge>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
