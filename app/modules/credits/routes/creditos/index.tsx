export { loader } from "./index.loader";

import { ArrowLeft, Award } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { personNameOf } from "@/modules/enrollments/utils/enrollment-labels";
import { DataTable } from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { TextInput } from "@/shared/components/common/text-input";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import type {
	DependencyCreditRow,
	StaffCreditRow,
} from "../../domain/credit.types";
import { CREDIT_PARAMS, yearOptions } from "../../utils/credit-params";
import type { Route } from "./+types/index";

const SEARCH_DEBOUNCE_MS = 300;

type StaffRow = StaffCreditRow & { id: string };
type DependencyRow = DependencyCreditRow & { id: string };

export const handle = {
	breadcrumb: () => [{ label: "Créditos" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Créditos" }];
}

export default function CreditosPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { overview, currentYear, search },
		pagination,
	} = loaderData;
	const [, setSearchParams] = useSearchParams();

	const updateParams = useCallback(
		(patch: Record<string, string | number | null>) => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					for (const [key, value] of Object.entries(patch)) {
						if (value === null || value === "") next.delete(key);
						else next.set(key, String(value));
					}
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);

	const [searchTerm, setSearchTerm] = useState(search);

	useEffect(() => {
		if (searchTerm === search) return;

		const timeout = setTimeout(
			() => updateParams({ search: searchTerm, page: null }),
			SEARCH_DEBOUNCE_MS,
		);

		return () => clearTimeout(timeout);
	}, [searchTerm, search, updateParams]);

	const staffColumns = useMemo(
		() => [
			columnHelpers.custom<StaffRow>("email", "Persona", (row) => (
				<div className="min-w-0">
					<p className="truncate text-sm">{personNameOf(row)}</p>
					<p className="truncate text-muted-foreground text-xs">{row.email}</p>
				</div>
			)),
			columnHelpers.custom<StaffRow>(
				"currentDependencyName",
				"Dependencia actual",
				(row) => (
					<div className="flex flex-wrap items-center gap-2">
						<span>{row.currentDependencyName ?? "Sin dependencia"}</span>
						{row.transferred && <Badge variant="outline">Transferido</Badge>}
					</div>
				),
			),
			columnHelpers.custom<StaffRow>(
				"credits",
				"Créditos",
				(row) => row.credits,
			),
		],
		[],
	);

	const dependencyColumns = useMemo(
		() => [
			columnHelpers.text<DependencyRow>("name", "Dependencia"),
			columnHelpers.custom<DependencyRow>(
				"people",
				"Personas con crédito",
				(row) => row.people,
			),
			columnHelpers.custom<DependencyRow>(
				"credits",
				"Créditos",
				(row) => row.credits,
			),
		],
		[],
	);

	const yearSelect = (
		<Select
			value={String(overview.fiscalYear)}
			onValueChange={(value) =>
				updateParams({ [CREDIT_PARAMS.fiscalYear]: value, page: null })
			}
		>
			<SelectTrigger className="w-40">
				<SelectValue placeholder="Ejercicio" />
			</SelectTrigger>
			<SelectContent>
				{yearOptions(overview.fiscalYear, currentYear).map((year) => (
					<SelectItem key={year} value={String(year)}>
						Ejercicio {year}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	if (overview.view === "dependencies") {
		const rows = overview.rows.map((row) => ({
			...row,
			id: row.dependencyDocumentId,
		}));

		return (
			<div className="flex flex-col">
				<PageHeader
					title="Créditos por dependencia"
					description="Cada crédito cuenta para la dependencia a la que pertenecía la persona al obtenerlo."
				/>
				<div className="mb-4 flex justify-end">{yearSelect}</div>
				<div className="overflow-hidden rounded-lg border border-border bg-card">
					<DataTable
						data={rows}
						columns={dependencyColumns}
						emptyState={{
							icon: Award,
							title: "Sin dependencias",
							description: "No hay dependencias activas.",
						}}
						mobileCard={{
							title: (row) => row.name,
							description: (row) =>
								`${row.credits} créditos · ${row.people} personas`,
						}}
						onRowClick={(row) =>
							updateParams({
								[CREDIT_PARAMS.dependency]: row.dependencyDocumentId,
								page: null,
							})
						}
					/>
				</div>
			</div>
		);
	}

	const rows = overview.rows.map((row) => ({ ...row, id: row.userDocumentId }));

	return (
		<div className="flex flex-col">
			<PageHeader
				title={`Créditos · ${overview.dependency.name}`}
				description="El personal de la dependencia y quien obtuvo créditos para ella en el ejercicio, aunque ya se haya cambiado."
				actions={
					overview.canChangeDependency && (
						<Button
							variant="outline"
							onClick={() =>
								updateParams({
									[CREDIT_PARAMS.dependency]: null,
									search: null,
									page: null,
								})
							}
						>
							<ArrowLeft className="h-4 w-4" />
							Todas las dependencias
						</Button>
					)
				}
			/>

			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="w-full sm:max-w-xs">
					<TextInput
						name="search"
						placeholder="Buscar por nombre o correo"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>
				{yearSelect}
			</div>

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<DataTable
					data={rows}
					columns={staffColumns}
					emptyState={{
						icon: Award,
						title: "Sin personal",
						description: "No hay personas que coincidan con la búsqueda.",
					}}
					mobileCard={{
						title: (row) => personNameOf(row),
						description: (row) => `${row.credits} créditos`,
					}}
					pagination={
						pagination && {
							total: pagination.total,
							page: pagination.page,
							pageSize: pagination.pageSize,
							pageCount: pagination.totalPages,
							onPageChange: (nextPage) => updateParams({ page: nextPage }),
							onPageSizeChange: (nextSize) =>
								updateParams({ pageSize: nextSize, page: null }),
						}
					}
				/>
			</div>
		</div>
	);
}
