export { loader } from "./index.loader";

import { MailX, ServerCrash } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { formatZonedDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { DataTable } from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { useRouteReloading } from "@/shared/hooks/use-route-reloading";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { JOB_FAILURE_RETENTION_DAYS } from "@/shared/queue/queue.config";
import {
	OPERATIONS_TABS,
	type OperationsTab,
} from "../../domain/operations.config";
import { previewError } from "../../domain/operations.rules";
import type {
	FailedEmailRow,
	JobFailureRow,
} from "../../domain/operations.types";
import type { Route } from "./+types/index";

const TAB_LABELS: Record<OperationsTab, string> = {
	emails: "Correos fallidos",
	jobs: "Trabajos fallidos",
};

const dateTime = (value: Date | string) => formatZonedDateTime(new Date(value));

export const handle = {
	breadcrumb: () => [{ label: "Operación" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Operación" }];
}

/** El error en una línea; el texto completo queda en el título para leerlo entero. */
function ErrorPreview({ text }: { text: string | null }) {
	if (!text)
		return <span className="text-muted-foreground text-sm">Sin detalle</span>;

	return (
		<code
			className="block max-w-xl truncate font-mono text-muted-foreground text-xs"
			title={text}
		>
			{previewError(text)}
		</code>
	);
}

function TabNav({ active }: { active: OperationsTab }) {
	return (
		<nav aria-label="Qué revisar" className="mb-4">
			<ul className="inline-flex gap-1 rounded-full bg-muted p-1">
				{OPERATIONS_TABS.map((tab) => (
					<li key={tab}>
						<Link
							to={tab === "emails" ? "?" : `?tab=${tab}`}
							preventScrollReset
							aria-current={tab === active ? "page" : undefined}
							className={cn(
								"inline-flex h-8 items-center rounded-full px-3.5 font-medium text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
								tab === active
									? "bg-background text-foreground shadow-sm"
									: "text-foreground/60 hover:text-foreground",
							)}
						>
							{TAB_LABELS[tab]}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}

export default function OperationsPage({ loaderData }: Route.ComponentProps) {
	const { data, pagination } = loaderData;
	const isReloading = useRouteReloading();
	const [, setSearchParams] = useSearchParams();

	const updateParams = useCallback(
		(patch: Record<string, string | number | null>) => {
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					for (const [key, value] of Object.entries(patch)) {
						if (value === null) next.delete(key);
						else next.set(key, String(value));
					}
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);

	const tablePagination = pagination && {
		total: pagination.total,
		page: pagination.page,
		pageSize: pagination.pageSize,
		pageCount: pagination.totalPages,
		onPageChange: (page: number) => updateParams({ page }),
		onPageSizeChange: (pageSize: number) =>
			updateParams({ pageSize, page: null }),
	};

	const emailColumns = useMemo(
		() => [
			columnHelpers.custom<FailedEmailRow>(
				"recipient",
				"Destinatario",
				(email) => (
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-foreground text-sm">
							{email.recipient}
						</span>
						<span className="text-muted-foreground text-xs">
							{email.template}
						</span>
					</div>
				),
				{ sortable: false },
			),
			columnHelpers.custom<FailedEmailRow>(
				"lastError",
				"Último error",
				(email) => <ErrorPreview text={email.lastError} />,
				{ sortable: false },
			),
			columnHelpers.custom<FailedEmailRow>(
				"attempts",
				"Intentos",
				(email) => (
					<span className="text-sm tabular-nums">{email.attempts}</span>
				),
				{ sortable: false },
			),
			columnHelpers.custom<FailedEmailRow>(
				"createdAt",
				"Encolado",
				(email) => (
					<span className="whitespace-nowrap text-muted-foreground text-sm">
						{dateTime(email.createdAt)}
					</span>
				),
				{ sortable: false },
			),
		],
		[],
	);

	const jobColumns = useMemo(
		() => [
			columnHelpers.custom<JobFailureRow>(
				"name",
				"Trabajo",
				(job) => (
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-foreground text-sm">
							{job.name}
						</span>
						<span className="text-muted-foreground text-xs">
							Cola {job.queue}
						</span>
					</div>
				),
				{ sortable: false },
			),
			columnHelpers.custom<JobFailureRow>(
				"error",
				"Error",
				(job) => <ErrorPreview text={job.error} />,
				{ sortable: false },
			),
			columnHelpers.custom<JobFailureRow>(
				"attempts",
				"Intentos",
				(job) => <span className="text-sm tabular-nums">{job.attempts}</span>,
				{ sortable: false },
			),
			columnHelpers.custom<JobFailureRow>(
				"failedAt",
				"Falló",
				(job) => (
					<span className="whitespace-nowrap text-muted-foreground text-sm">
						{dateTime(job.failedAt)}
					</span>
				),
				{ sortable: false },
			),
		],
		[],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Operación"
				description="Lo que la plataforma no pudo entregar por sí sola después de agotar sus reintentos. Es de consulta: aquí se averigua qué falló."
			/>

			<TabNav active={data.tab} />

			<div className="overflow-hidden rounded-lg border border-border bg-card">
				{data.tab === "emails" ? (
					<DataTable
						isLoading={isReloading}
						data={data.emails}
						columns={emailColumns}
						emptyState={{
							icon: MailX,
							title: "No hay correos fallidos",
							description:
								"Todos los avisos salieron o siguen en su turno de reintento.",
						}}
						mobileCard={{
							title: (email) => email.recipient,
							description: (email) =>
								`${email.template} · ${email.attempts} intentos`,
							content: (email) => (
								<div className="flex flex-col gap-1">
									<ErrorPreview text={email.lastError} />
									<span className="text-muted-foreground text-xs">
										Encolado el {dateTime(email.createdAt)}
									</span>
								</div>
							),
						}}
						pagination={tablePagination}
					/>
				) : (
					<DataTable
						isLoading={isReloading}
						data={data.jobs}
						columns={jobColumns}
						emptyState={{
							icon: ServerCrash,
							title: "No hay trabajos fallidos",
							description: `Se conservan ${JOB_FAILURE_RETENTION_DAYS} días; pasado ese plazo se borran solos.`,
						}}
						mobileCard={{
							title: (job) => job.name,
							description: (job) =>
								`Cola ${job.queue} · ${job.attempts} intentos`,
							content: (job) => (
								<div className="flex flex-col gap-1">
									<ErrorPreview text={job.error} />
									<span className="text-muted-foreground text-xs">
										Falló el {dateTime(job.failedAt)}
									</span>
								</div>
							),
						}}
						pagination={tablePagination}
					/>
				)}
			</div>
		</div>
	);
}
