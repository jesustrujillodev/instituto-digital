export { action } from "./index.action";
export { loader } from "./index.loader";

import { DoorClosed, DoorOpen, Flag, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { CourseQrPanel } from "@/modules/check-in/components/course-qr-panel";
import { ModuleQuizResults } from "@/modules/content/components/module-quiz-results";
import { ProgressBar } from "@/modules/content/components/progress-bar";
import type { ModuleQuizBoard } from "@/modules/content/domain/quiz.types";
import {
	CourseFormatBadge,
	CourseModalityBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import {
	countsAttendance,
	requiresContent,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import {
	COMPLETION_RULE_LABELS,
	EVALUATION_METHOD_LABELS,
} from "@/modules/courses/utils/course-labels";
import {
	RETURN_PARAM,
	RETURN_TO_TEACHING,
	stepOfKey,
	stepPath,
} from "@/modules/courses/utils/course-wizard-steps";
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
	PAYLOAD_FIELD,
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

/**
 * El cierre del autogestivo: no se finaliza, deja de admitir gente. Quien ya
 * está inscrito sigue avanzando y completa cuando termine (docs/adr/0014).
 */
function EnrollmentWindowCard({ detail }: { detail: TeachingDetail }) {
	const fetcher = useFetcher<TeachingActionData>();
	useFetcherToast(fetcher);
	const [confirming, setConfirming] = useState(false);

	const closedAt = detail.course.enrollmentClosedAt;
	const open = closedAt === null;

	const submit = (nextOpen: boolean) =>
		fetcher.submit(
			{
				[INTENT_FIELD]: TEACHING_INTENTS.enrollmentWindow,
				[PAYLOAD_FIELD]: JSON.stringify({ open: nextOpen }),
			},
			{ method: "post" },
		);

	return (
		<Card>
			<CardContent className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h3 className="font-medium text-sm">
						{open ? "Inscripciones abiertas" : "Inscripciones cerradas"}
					</h3>
					<p className="text-muted-foreground text-xs">
						{open
							? "Un curso autogestivo no se finaliza: cada participante lo completa al terminarlo y recibe su crédito en ese momento."
							: `Cerradas el ${formatZonedDate(new Date(closedAt))}. Quien ya está inscrito puede seguir avanzando.`}
					</p>
				</div>
				<Button
					variant={open ? "outline" : "default"}
					disabled={!detail.can.toggleEnrollment || fetcher.state !== "idle"}
					onClick={() => (open ? setConfirming(true) : submit(true))}
				>
					{open ? <DoorClosed /> : <DoorOpen />}
					{open ? "Cerrar inscripciones" : "Reabrir inscripciones"}
				</Button>
			</CardContent>

			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title="¿Cerrar las inscripciones?"
				description="El curso deja de aparecer en el catálogo y nadie nuevo puede inscribirse. Quien ya está inscrito sigue avanzando. Puedes reabrirlas cuando quieras."
				confirmLabel="Cerrar inscripciones"
				cancelLabel="Volver"
				onConfirm={() => {
					submit(false);
					setConfirming(false);
				}}
			/>
		</Card>
	);
}

/**
 * El avance por lección de cada participante, junto al pase de lista, y cómo
 * le fue en cada evaluación de módulo.
 */
function ProgressList({
	detail,
	moduleQuizzes,
}: {
	detail: TeachingDetail;
	moduleQuizzes: ModuleQuizBoard | null;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<h3 className="font-medium text-sm">Avance en el contenido</h3>
				{moduleQuizzes && (
					<p className="text-muted-foreground text-xs">
						El avance incluye aprobar la evaluación de cada módulo.
						{moduleQuizzes.canGrantRetake &&
							" A quien repruebe la última, puedes habilitarle otro intento."}
					</p>
				)}
				<ul className="flex flex-col divide-y divide-border">
					{detail.participants.map((participant) => (
						<li
							key={participant.userDocumentId}
							className="grid items-center gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_12rem]"
						>
							<div className="min-w-0">
								<p className="truncate text-sm">{personNameOf(participant)}</p>
								<p className="truncate text-muted-foreground text-xs">
									{participant.contentCompletedAt
										? `Terminó el contenido el ${formatZonedDate(new Date(participant.contentCompletedAt))}`
										: "Sin terminar"}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<ProgressBar
									value={participant.progressPercent}
									label={`Avance de ${personNameOf(participant)}`}
								/>
								<span className="w-10 text-right text-muted-foreground text-xs tabular-nums">
									{participant.progressPercent} %
								</span>
							</div>
							{moduleQuizzes && (
								<div className="sm:col-span-2">
									<ModuleQuizResults
										courseDocumentId={detail.course.documentId}
										board={moduleQuizzes}
										userDocumentId={participant.userDocumentId}
										personName={personNameOf(participant)}
									/>
								</div>
							)}
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}

function CompletionList({ detail }: { detail: TeachingDetail }) {
	// Un autogestivo completa en vivo: lo guardado ya es el hecho, no una
	// previsión del cierre.
	const live =
		detail.course.status === "FINISHED" ||
		!requiresSessions(detail.course.format);

	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<h3 className="font-medium text-sm">
					{live ? "Quién completó" : "Avance hacia el cierre"}
				</h3>
				<ul className="flex flex-col divide-y divide-border">
					{detail.participants.map((participant) => {
						const completed = live
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
										{countsAttendance(detail.course.completionRule) &&
											` · asistencia ${participant.attendancePercent} %`}
										{requiresContent(detail.course) &&
											` · contenido ${participant.progressPercent} %`}
										{detail.course.requiresEvaluation &&
											` · ${ENROLLMENT_RESULT_LABELS[participant.result]}`}
										{participant.grade !== null && ` (${participant.grade})`}
									</p>
								</div>
								<Badge variant={completed ? "default" : "outline"}>
									{completed
										? live
											? "Completó"
											: "Completaría"
										: live
											? "Sin completar"
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
		data: { ratings, evaluations, moduleQuizzes, ...detail },
	} = loaderData;
	const { course } = detail;
	const finished = course.status === "FINISHED";
	const scheduled = requiresSessions(course.format);
	const withContent = requiresContent(course);

	// Editar vuelve aquí al terminar: se entra y se sale desde la impartición.
	const editHref = (step: number) =>
		`${stepPath(course.documentId, step, "edit")}?${RETURN_PARAM}=${RETURN_TO_TEACHING}`;

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={course.title}
				description={`Organiza ${course.dependencyName}. Se completa con: ${COMPLETION_RULE_LABELS[course.completionRule].toLowerCase()}${countsAttendance(course.completionRule) ? ` (mínimo ${course.minAttendance} %)` : ""}${course.requiresEvaluation ? `, evaluado con ${EVALUATION_METHOD_LABELS[course.evaluationMethod].toLowerCase()}` : ""}.`}
				goBack="/dashboard/imparticion"
				actions={
					detail.can.editCourse ? (
						<Button variant="outline" asChild>
							<Link to={editHref(1)}>
								<Pencil aria-hidden="true" />
								Editar curso
							</Link>
						</Button>
					) : undefined
				}
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

			{!finished &&
				(scheduled ? (
					<FinishCard detail={detail} />
				) : (
					<EnrollmentWindowCard detail={detail} />
				))}

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
					{withContent && <TabsTrigger value="progress">Avance</TabsTrigger>}
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
							defineHref={
								detail.can.editCourse
									? editHref(stepOfKey("rules").number)
									: null
							}
						/>
					</TabsContent>
				)}
				{withContent && (
					<TabsContent value="progress">
						<ProgressList detail={detail} moduleQuizzes={moduleQuizzes} />
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
