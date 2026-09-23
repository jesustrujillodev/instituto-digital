export { action } from "./index.action";
export { loader } from "./index.loader";

import {
	BookPlus,
	CalendarRange,
	ExternalLink,
	Pencil,
	Plus,
	RotateCcw,
	Trash2,
	XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { CourseModalityBadge } from "@/modules/courses/components/course-badges";
import { FORMAT_LABELS } from "@/modules/courses/utils/course-labels";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import {
	DataTable,
	type DataTableAction,
} from "@/shared/components/common/data-table";
import { columnHelpers } from "@/shared/components/common/data-table-columns";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	PlanLineStatusBadge,
	PlanProgressBar,
} from "../../../components/plan-badges";
import { PlanLineDialog } from "../../../components/plan-line-dialog";
import type { PlanLineView } from "../../../domain/annual-plan.types";
import {
	INTENT_FIELD,
	LINE_FIELD,
	PLAN_INTENTS,
	type PlanActionData,
} from "../../../utils/parse-plan-form-data";
import { MONTH_LABELS } from "../../../utils/plan-labels";
import type { Route } from "./+types/index";

type LineRow = PlanLineView & { id: string };

const newCoursePath = (line: PlanLineView) =>
	`/dashboard/cursos/nuevo?linea=${line.documentId}`;

const coursePath = (line: PlanLineView) =>
	line.activeCourse
		? `/dashboard/cursos/${line.activeCourse.documentId}`
		: null;

/** Dice por qué la línea está realizada sin que su curso se haya finalizado. */
function SelfPacedHint({ line }: { line: PlanLineView }) {
	if (line.activeCourse?.format !== "SELF_PACED") return null;
	return (
		<span className="text-muted-foreground text-xs">
			{FORMAT_LABELS.SELF_PACED}
		</span>
	);
}

export const handle = {
	breadcrumb: () => [
		{ label: "Plan anual", path: "/dashboard/plan-anual" },
		{ label: "Plan" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Plan anual" }];
}

function LineCard({ line }: { line: PlanLineView }) {
	const path = coursePath(line);

	return (
		<li className="flex flex-col gap-1 rounded-md border border-border p-2">
			<div className="flex items-start justify-between gap-2">
				<span className="font-medium text-sm">{line.title}</span>
				<PlanLineStatusBadge status={line.status} />
			</div>
			{path && line.activeCourse && (
				<div className="flex flex-wrap items-baseline gap-x-2">
					<Link
						to={path}
						className="text-muted-foreground text-xs hover:underline"
					>
						{line.activeCourse.title}
					</Link>
					<SelfPacedHint line={line} />
				</div>
			)}
		</li>
	);
}

export default function PlanDetallePage({ loaderData }: Route.ComponentProps) {
	const {
		data: { plan, lines, months, progress, readOnly, canManage },
	} = loaderData;
	const navigate = useNavigate();
	const fetcher = useFetcher<PlanActionData>();
	useFetcherToast(fetcher);

	const [editing, setEditing] = useState<PlanLineView | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [confirm, setConfirm] = useState<{
		line: PlanLineView;
		intent: typeof PLAN_INTENTS.cancelLine | typeof PLAN_INTENTS.deleteLine;
	} | null>(null);

	const submit = useCallback(
		(line: PlanLineView, intent: string) =>
			fetcher.submit(
				{ [INTENT_FIELD]: intent, [LINE_FIELD]: line.documentId },
				{ method: "post" },
			),
		[fetcher],
	);

	const openDialog = useCallback((line: PlanLineView | null) => {
		setEditing(line);
		setDialogOpen(true);
	}, []);

	const rows = useMemo<LineRow[]>(
		() => lines.map((line) => ({ ...line, id: line.documentId })),
		[lines],
	);

	const columns = useMemo(
		() => [
			columnHelpers.custom<LineRow>("title", "Línea", (line) => (
				<div className="min-w-0">
					<p className="truncate font-medium text-sm">{line.title}</p>
					<p className="truncate text-muted-foreground text-xs">
						{[line.estimatedDuration, line.targetAudience]
							.filter(Boolean)
							.join(" · ") || "Sin duración ni público"}
					</p>
				</div>
			)),
			columnHelpers.custom<LineRow>(
				"plannedMonth",
				"Mes",
				(line) => MONTH_LABELS[line.plannedMonth],
			),
			columnHelpers.custom<LineRow>("plannedModality", "Modalidad", (line) =>
				line.plannedModality ? (
					<CourseModalityBadge modality={line.plannedModality} />
				) : (
					<span className="text-muted-foreground">Sin definir</span>
				),
			),
			columnHelpers.custom<LineRow>("status", "Estado", (line) => (
				<PlanLineStatusBadge status={line.status} />
			)),
			columnHelpers.custom<LineRow>("activeCourse", "Curso", (line) => {
				const path = coursePath(line);
				return path && line.activeCourse ? (
					<div className="flex flex-col">
						<Link to={path} className="text-sm hover:underline">
							{line.activeCourse.title}
						</Link>
						<SelfPacedHint line={line} />
					</div>
				) : (
					<span className="text-muted-foreground text-sm">
						{line.cancelledCourses > 0
							? `${line.cancelledCourses} cancelado(s)`
							: "—"}
					</span>
				);
			}),
		],
		[],
	);

	const actions = useMemo<DataTableAction<LineRow>[]>(
		() => [
			{
				icon: BookPlus,
				label: "Crear curso",
				show: (line) => line.can.createCourse,
				onClick: (line) => navigate(newCoursePath(line)),
			},
			{
				icon: ExternalLink,
				label: "Ver curso",
				show: (line) => line.activeCourse !== null,
				onClick: (line) => {
					const path = coursePath(line);
					if (path) navigate(path);
				},
			},
			{
				icon: Pencil,
				label: "Editar",
				show: (line) => line.can.edit,
				onClick: (line) => openDialog(line),
			},
			{
				icon: RotateCcw,
				label: "Reactivar",
				show: (line) => line.can.reactivate,
				onClick: (line) => submit(line, PLAN_INTENTS.reactivateLine),
			},
			{
				icon: XCircle,
				label: "Cancelar línea",
				show: (line) => line.can.cancel,
				onClick: (line) =>
					setConfirm({ line, intent: PLAN_INTENTS.cancelLine }),
			},
			{
				icon: Trash2,
				label: "Borrar",
				variant: "danger",
				show: (line) => line.can.delete,
				onClick: (line) =>
					setConfirm({ line, intent: PLAN_INTENTS.deleteLine }),
			},
		],
		[navigate, openDialog, submit],
	);

	const deleting = confirm?.intent === PLAN_INTENTS.deleteLine;

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={`Plan anual ${plan.fiscalYear}`}
				description={plan.dependencyName}
				goBack="/dashboard/plan-anual"
				actions={
					canManage && (
						<Button onClick={() => openDialog(null)}>
							<Plus className="h-4 w-4" />
							Nueva línea
						</Button>
					)
				}
				collapseActionsOnMobile
			/>

			<Card>
				<CardContent>
					<PlanProgressBar progress={progress} />
				</CardContent>
			</Card>

			{readOnly && (
				<Alert>
					<AlertDescription>
						Es el plan de un ejercicio anterior: queda en solo lectura.
					</AlertDescription>
				</Alert>
			)}

			<Tabs defaultValue="list">
				<TabsList>
					<TabsTrigger value="list">Lista</TabsTrigger>
					<TabsTrigger value="months">Por mes</TabsTrigger>
				</TabsList>

				<TabsContent value="list">
					<div className="overflow-hidden rounded-lg border border-border bg-card">
						<DataTable
							data={rows}
							columns={columns}
							actions={canManage ? actions : undefined}
							emptyState={{
								icon: CalendarRange,
								title: "Sin líneas",
								description: canManage
									? "Agrega los cursos que la dependencia prevé dar este año."
									: "Este plan todavía no tiene líneas.",
							}}
							mobileCard={{
								title: (line) => line.title,
								description: (line) => MONTH_LABELS[line.plannedMonth],
								content: (line) => <PlanLineStatusBadge status={line.status} />,
							}}
						/>
					</div>
				</TabsContent>

				<TabsContent value="months">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{months.map(({ month, lines: monthLines }) => (
							<Card key={month}>
								<CardContent className="flex flex-col gap-2">
									<h3 className="font-medium text-sm">
										{MONTH_LABELS[month]}{" "}
										<span className="text-muted-foreground">
											({monthLines.length})
										</span>
									</h3>
									{monthLines.length === 0 ? (
										<p className="text-muted-foreground text-xs">
											Sin cursos previstos.
										</p>
									) : (
										<ul className="flex flex-col gap-2">
											{monthLines.map((line) => (
												<LineCard key={line.documentId} line={line} />
											))}
										</ul>
									)}
								</CardContent>
							</Card>
						))}
					</div>
				</TabsContent>
			</Tabs>

			<PlanLineDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				line={editing}
			/>

			<ConfirmDialog
				open={confirm !== null}
				onOpenChange={(open) => {
					if (!open) setConfirm(null);
				}}
				title={deleting ? "¿Borrar la línea?" : "¿Cancelar la línea?"}
				description={
					deleting
						? `"${confirm?.line.title ?? ""}" se borrará del plan. Solo se puede porque nunca tuvo curso.`
						: `"${confirm?.line.title ?? ""}" dejará de contar para el avance. Puedes reactivarla después.`
				}
				confirmLabel={deleting ? "Borrar" : "Cancelar línea"}
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					if (confirm) submit(confirm.line, confirm.intent);
					setConfirm(null);
				}}
			/>
		</div>
	);
}
