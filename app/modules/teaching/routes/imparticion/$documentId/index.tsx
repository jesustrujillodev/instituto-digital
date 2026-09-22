export { action } from "./index.action";
export { loader } from "./index.loader";

import { Flag } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { CourseQrPanel } from "@/modules/check-in/components/course-qr-panel";
import {
	CourseFormatBadge,
	CourseModalityBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import { requiresSessions } from "@/modules/courses/domain/course.rules";
import {
	ENROLLMENT_RESULT_LABELS,
	personNameOf,
} from "@/modules/enrollments/utils/enrollment-labels";
import { EvaluationsPanel } from "@/modules/evaluations/components/evaluations-panel";
import { ConfirmDialog } from "@/shared/components/common/confirm-dialog";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
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
import { AttendancePanel } from "../../../components/attendance-panel";
import { RatingsPanel } from "../../../components/ratings-panel";
import { ResultsPanel } from "../../../components/results-panel";
import type { TeachingDetail } from "../../../domain/teaching.types";
import {
	INTENT_FIELD,
	TEACHING_INTENTS,
	type TeachingActionData,
} from "../../../utils/parse-teaching-form-data";
import { finishBlockerMessage } from "../../../utils/teaching-labels";
import type { Route } from "./+types/index";

export const handle = {
	breadcrumb: () => [
		{ label: "Impartición", path: "/dashboard/imparticion" },
		{ label: "Curso" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Impartición" }];
}

function FinishCard({ detail }: { detail: TeachingDetail }) {
	const fetcher = useFetcher<TeachingActionData>();
	useFetcherToast(fetcher);
	const [confirming, setConfirming] = useState(false);

	const opensAt = detail.course.finishOpensAt
		? new Date(detail.course.finishOpensAt)
		: null;

	return (
		<Card>
			<CardContent className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h3 className="font-medium text-sm">Finalizar curso</h3>
					<p className="text-muted-foreground text-xs">
						{detail.finishBlocker
							? finishBlockerMessage(detail.finishBlocker, {
									opensAt,
									pendingResults: detail.pendingResults,
								})
							: "Calcula quién completó, otorga los créditos y abre la valoración."}
					</p>
				</div>
				<Button
					disabled={!detail.can.finish || fetcher.state !== "idle"}
					onClick={() => setConfirming(true)}
				>
					<Flag className="h-4 w-4" />
					Finalizar
				</Button>
			</CardContent>

			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title="¿Finalizar el curso?"
				description="Se otorgan los créditos a quien completó. Después, solo el titular o un auxiliar de la dependencia pueden corregir asistencia y resultados."
				confirmLabel="Finalizar"
				cancelLabel="Volver"
				onConfirm={() => {
					fetcher.submit(
						{ [INTENT_FIELD]: TEACHING_INTENTS.finish },
						{ method: "post" },
					);
					setConfirming(false);
				}}
			/>
		</Card>
	);
}

function CompletionList({ detail }: { detail: TeachingDetail }) {
	const finished = detail.course.status === "FINISHED";

	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<h3 className="font-medium text-sm">
					{finished ? "Quién completó" : "Avance hacia el cierre"}
				</h3>
				<ul className="flex flex-col divide-y divide-border">
					{detail.participants.map((participant) => {
						const completed = finished
							? participant.completed
							: participant.wouldComplete;

						return (
							<li
								key={participant.userDocumentId}
								className="flex flex-wrap items-center justify-between gap-2 py-2"
							>
								<div className="min-w-0">
									<p className="truncate text-sm">
										{personNameOf(participant)}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{participant.dependencyName ?? "Sin dependencia"}
										{detail.course.completionRule === "ATTENDANCE" &&
											` · asistencia ${participant.attendancePercent} %`}
										{detail.course.requiresEvaluation &&
											` · ${ENROLLMENT_RESULT_LABELS[participant.result]}`}
										{participant.grade !== null && ` (${participant.grade})`}
									</p>
								</div>
								<Badge variant={completed ? "default" : "outline"}>
									{completed
										? finished
											? "Completó"
											: "Completaría"
										: "No completa"}
								</Badge>
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}

export default function ImparticionDetallePage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { ratings, evaluations, ...detail },
	} = loaderData;
	const { course } = detail;
	const finished = course.status === "FINISHED";
	const scheduled = requiresSessions(course.format);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={course.title}
				description={
					course.completionRule === "ATTENDANCE"
						? `Organiza ${course.dependencyName}. Asistencia mínima ${course.minAttendance} %${course.requiresEvaluation ? ", con evaluación" : ""}.`
						: `Organiza ${course.dependencyName}. Se completa al aprobar la evaluación.`
				}
				goBack="/dashboard/imparticion"
			/>

			<div className="flex flex-wrap gap-2">
				<CourseStatusBadge status={course.status} />
				{scheduled && <CourseModalityBadge modality={course.modality} />}
				<CourseFormatBadge format={course.format} />
				<Badge variant="outline">{detail.participants.length} inscritos</Badge>
			</div>

			{finished && (
				<Alert>
					<AlertDescription>
						{detail.can.correct
							? `Finalizado el ${course.finishedAt ? formatZonedDate(new Date(course.finishedAt)) : ""}. Cada corrección de asistencia o resultados recalcula los créditos y queda registrado quién la hizo.`
							: "El curso está finalizado. Solo el titular o un auxiliar de la dependencia organizadora pueden corregirlo."}
					</AlertDescription>
				</Alert>
			)}

			{!finished && <FinishCard detail={detail} />}

			<Tabs defaultValue={scheduled ? "attendance" : "completion"}>
				<TabsList>
					{scheduled && (
						<TabsTrigger value="attendance">Asistencia</TabsTrigger>
					)}
					{course.requiresEvaluation && (
						<TabsTrigger value="results">
							Resultados
							{detail.pendingResults > 0 && ` (${detail.pendingResults})`}
						</TabsTrigger>
					)}
					{evaluations && (
						<TabsTrigger value="evaluations">Evaluaciones</TabsTrigger>
					)}
					<TabsTrigger value="completion">Completado</TabsTrigger>
					{scheduled && detail.qr && (
						<TabsTrigger value="qr">Código QR</TabsTrigger>
					)}
					{ratings && <TabsTrigger value="ratings">Valoraciones</TabsTrigger>}
				</TabsList>
				{scheduled && (
					<TabsContent value="attendance">
						<AttendancePanel detail={detail} />
					</TabsContent>
				)}
				{course.requiresEvaluation && (
					<TabsContent value="results">
						<ResultsPanel detail={detail} />
					</TabsContent>
				)}
				{evaluations && (
					<TabsContent value="evaluations">
						<EvaluationsPanel
							courseDocumentId={course.documentId}
							board={evaluations}
							sessions={detail.sessions}
							participants={detail.participants}
						/>
					</TabsContent>
				)}
				<TabsContent value="completion">
					<CompletionList detail={detail} />
				</TabsContent>
				{scheduled && detail.qr && (
					<TabsContent value="qr">
						<CourseQrPanel title={course.title} qr={detail.qr} />
					</TabsContent>
				)}
				{ratings && (
					<TabsContent value="ratings">
						<RatingsPanel summary={ratings} />
					</TabsContent>
				)}
			</Tabs>
		</div>
	);
}
