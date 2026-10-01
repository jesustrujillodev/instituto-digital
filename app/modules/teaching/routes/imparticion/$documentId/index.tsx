export { action } from "./index.action";
export { loader } from "./index.loader";

import {
	Award,
	DoorClosed,
	DoorOpen,
	Download,
	Flag,
	Pencil,
	UserMinus,
} from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { useFileDownload } from "@/modules/certificates/hooks/use-file-download";
import { certificateDownloadUrl } from "@/modules/certificates/utils/certificate-urls";
import { CourseQrPanel } from "@/modules/check-in/components/course-qr-panel";
import { FollowUpBoardPanel } from "@/modules/content/components/follow-up-board";
import { ProgressBar } from "@/modules/content/components/progress-bar";
import { QuizResults } from "@/modules/content/components/quiz-results";
import { SessionMaterialsPanel } from "@/modules/content/components/session-materials-panel";
import type { QuizBoard } from "@/modules/content/domain/quiz.types";
import {
	CourseFormatBadge,
	CourseModalityBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import {
	allowsSessions,
	countsAttendance,
	gradesAutomatically,
	requiresContent,
	requiresSessions,
} from "@/modules/courses/domain/course.rules";
import { COMPLETION_RULE_LABELS } from "@/modules/courses/utils/course-labels";
import {
	RETURN_PARAM,
	RETURN_TO_TEACHING,
	stepPath,
} from "@/modules/courses/utils/course-wizard-steps";
import {
	ENROLLMENT_RESULT_LABELS,
	personNameOf,
} from "@/modules/enrollments/utils/enrollment-labels";
import {
	INTENT_FIELD as ENROLLMENT_INTENT_FIELD,
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	USER_FIELD,
} from "@/modules/enrollments/utils/parse-enrollment-form-data";
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
import { MANUAL_ATTENDANCE_ENABLED } from "../../../domain/teaching.config";
import type {
	TeachingDetail,
	TeachingParticipantView,
} from "../../../domain/teaching.types";
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
		{ label: "Capacitación" },
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
					<h3 className="font-medium text-sm">Finalizar capacitación</h3>
					<p className="text-muted-foreground text-xs">
						{detail.finishBlocker
							? finishBlockerMessage(detail.finishBlocker, { opensAt })
							: "Calcula quién completó, otorga créditos y certificados y abre la valoración."}
					</p>
				</div>
				<Button
					disabled={!detail.can.finish}
					pending={fetcher.state !== "idle"}
					onClick={() => setConfirming(true)}
				>
					<Flag className="h-4 w-4" />
					Finalizar
				</Button>
			</CardContent>

			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title="¿Finalizar la capacitación?"
				description={`Se otorgan los créditos y se emiten los certificados a quien completó. Después, solo el titular o un auxiliar de la dependencia pueden corregir ${MANUAL_ATTENDANCE_ENABLED ? "asistencia y resultados" : "resultados"}.`}
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
							? "Una capacitación autogestiva no se finaliza: cada participante la completa al terminarla y recibe su crédito en ese momento."
							: `Cerradas el ${formatZonedDate(new Date(closedAt))}. Quien ya está inscrito puede seguir avanzando.`}
					</p>
				</div>
				<Button
					variant={open ? "outline" : "default"}
					disabled={!detail.can.toggleEnrollment}
					pending={fetcher.state !== "idle"}
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
				description="La capacitación deja de aparecer en el catálogo y nadie nuevo puede inscribirse. Quien ya está inscrito sigue avanzando. Puedes reabrirlas cuando quieras."
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
 * El avance por lección de cada participante, si el curso cuenta el temario, y
 * cómo le fue en cada cuestionario.
 */
function ProgressList({
	detail,
	quizBoard,
	withContent,
}: {
	detail: TeachingDetail;
	quizBoard: QuizBoard | null;
	withContent: boolean;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<h3 className="font-medium text-sm">
					{withContent ? "Avance en el contenido" : "Intentos del examen"}
				</h3>
				{quizBoard && (
					<p className="text-muted-foreground text-xs">
						{withContent &&
							"El avance incluye presentar la evaluación de cada módulo. "}
						{gradesAutomatically(detail.course) &&
							`Se acredita con un promedio de ${detail.course.minPassingGrade} o más. `}
						{quizBoard.canGrantRetake &&
							"A quien repruebe y agote sus intentos sin acreditar, puedes habilitarle otro."}
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
								{withContent && (
									<p className="truncate text-muted-foreground text-xs">
										{participant.contentCompletedAt
											? `Terminó el contenido el ${formatZonedDate(new Date(participant.contentCompletedAt))}`
											: "Sin terminar"}
									</p>
								)}
							</div>
							{withContent && (
								<div className="flex items-center gap-2">
									<ProgressBar
										value={participant.progressPercent}
										label={`Avance de ${personNameOf(participant)}`}
									/>
									<span className="w-10 text-right text-muted-foreground text-xs tabular-nums">
										{participant.progressPercent} %
									</span>
								</div>
							)}
							{quizBoard && (
								<div className="sm:col-span-2">
									<QuizResults
										courseDocumentId={detail.course.documentId}
										board={quizBoard}
										userDocumentId={participant.userDocumentId}
										personName={personNameOf(participant)}
										accredited={
											participant.result === "PASSED" || participant.completed
										}
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

/**
 * Lo completado antes de que existieran los certificados no tiene el suyo: se
 * emite aquí, una vez. Lo que se complete después se emite solo.
 */
function IssueCertificatesCard({ detail }: { detail: TeachingDetail }) {
	const fetcher = useFetcher<TeachingActionData>();
	useFetcherToast(fetcher);

	return (
		<Card>
			<CardContent className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h3 className="font-medium text-sm">Certificados pendientes</h3>
					<p className="text-muted-foreground text-xs">
						{detail.pendingCertificates === 1
							? "1 persona completó la capacitación y no tiene certificado."
							: `${detail.pendingCertificates} personas completaron la capacitación y no tienen certificado.`}
					</p>
				</div>
				<Button
					pending={fetcher.state !== "idle"}
					onClick={() =>
						fetcher.submit(
							{ [INTENT_FIELD]: TEACHING_INTENTS.issueCertificates },
							{ method: "post" },
						)
					}
				>
					<Award aria-hidden="true" />
					Emitir certificados
				</Button>
			</CardContent>
		</Card>
	);
}

/** Folio y descarga del certificado de una persona. */
function CertificateCell({
	certificate,
	download,
	pending,
}: {
	certificate: NonNullable<TeachingParticipantView["certificate"]>;
	download: ReturnType<typeof useFileDownload>["download"];
	pending: string | null;
}) {
	if (certificate.revoked) {
		return (
			<Badge variant="outline" title={`Folio ${certificate.folio}`}>
				Certificado revocado
			</Badge>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<span className="text-muted-foreground text-xs tabular-nums">
				Folio {certificate.folio}
			</span>
			{(["pdf", "png"] as const).map((format) => {
				const url = certificateDownloadUrl(certificate.documentId, format);
				return (
					<Button
						key={format}
						variant="ghost"
						size="sm"
						disabled={pending !== null}
						pending={pending === url}
						aria-label={`Descargar certificado ${certificate.folio} en ${format.toUpperCase()}`}
						onClick={() => download(url, `certificado.${format}`)}
					>
						<Download aria-hidden="true" />
						{format.toUpperCase()}
					</Button>
				);
			})}
		</div>
	);
}

function CompletionList({ detail }: { detail: TeachingDetail }) {
	const { download, pending } = useFileDownload();
	// La inscripción es de `enrollments`: la baja va a su action, no a la de
	// impartición.
	const removal = useFetcher<EnrollmentActionData>();
	useFetcherToast(removal);
	const [removing, setRemoving] = useState<TeachingParticipantView | null>(
		null,
	);

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
								<div className="flex flex-wrap items-center gap-2">
									{live && participant.certificate && (
										<CertificateCell
											certificate={participant.certificate}
											download={download}
											pending={pending}
										/>
									)}
									<Badge variant={completed ? "default" : "outline"}>
										{completed
											? live
												? "Completó"
												: "Completaría"
											: live
												? "Sin completar"
												: "No completa"}
									</Badge>
									{participant.removable && (
										<Button
											variant="ghost"
											size="sm"
											disabled={removal.state !== "idle"}
											pending={
												removal.state !== "idle" &&
												removal.formData?.get(USER_FIELD) ===
													participant.userDocumentId
											}
											aria-label={`Dar de baja a ${personNameOf(participant)}`}
											onClick={() => setRemoving(participant)}
										>
											<UserMinus aria-hidden="true" />
											Dar de baja
										</Button>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			</CardContent>

			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open) setRemoving(null);
				}}
				title="¿Dar de baja a esta persona?"
				description={
					removing
						? `${personNameOf(removing)} deja la capacitación, su lugar queda libre y se le avisa por correo. No podrá volver a inscribirse por su cuenta: solo quien organiza la capacitación puede inscribirla o invitarla de nuevo.`
						: ""
				}
				confirmLabel="Dar de baja"
				cancelLabel="Volver"
				destructive
				onConfirm={() => {
					if (removing) {
						removal.submit(
							{
								[ENROLLMENT_INTENT_FIELD]: ENROLLMENT_INTENTS.remove,
								[USER_FIELD]: removing.userDocumentId,
							},
							{
								method: "post",
								action: `/dashboard/capacitaciones/${detail.course.documentId}/inscripciones`,
							},
						);
					}
					setRemoving(null);
				}}
			/>
		</Card>
	);
}

export default function ImparticionDetallePage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { ratings, followUps, gradesAutomatically, quizBoard, ...detail },
	} = loaderData;
	const { course } = detail;
	const finished = course.status === "FINISHED";
	const scheduled = requiresSessions(course.format);
	// El híbrido autogestivo pasa lista en sus sesiones, aunque no cuenten para
	// completarlo.
	const withAttendance = scheduled || detail.sessions.length > 0;
	const withContent = requiresContent(course);

	// Editar vuelve aquí al terminar: se entra y se sale desde la impartición.
	const editHref = (step: number) =>
		`${stepPath(course.documentId, step, "edit")}?${RETURN_PARAM}=${RETURN_TO_TEACHING}`;

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={course.title}
				description={`Organiza ${course.dependencyName}. Se completa con: ${COMPLETION_RULE_LABELS[course.completionRule].toLowerCase()}${countsAttendance(course.completionRule) ? ` (mínimo ${course.minAttendance} %)` : ""}${course.requiresEvaluation ? ", evaluado con examen en línea" : ""}.`}
				goBack="/dashboard/imparticion"
				actions={
					detail.can.editCourse ? (
						<Button variant="outline" asChild>
							<Link to={editHref(1)}>
								<Pencil aria-hidden="true" />
								Editar capacitación
							</Link>
						</Button>
					) : undefined
				}
			/>

			<div className="flex flex-wrap gap-2">
				<CourseStatusBadge status={course.status} />
				{allowsSessions(course) && (
					<CourseModalityBadge modality={course.modality} />
				)}
				<CourseFormatBadge format={course.format} />
				<Badge variant="outline">{detail.participants.length} inscritos</Badge>
			</div>

			{finished && (
				<Alert>
					<AlertDescription>
						{detail.can.correct
							? `Finalizado el ${course.finishedAt ? formatZonedDate(new Date(course.finishedAt)) : ""}. Cada corrección de ${MANUAL_ATTENDANCE_ENABLED ? "asistencia o resultados" : "resultados"} recalcula los créditos y queda registrado quién la hizo.`
							: "La capacitación está finalizada. Solo el titular o un auxiliar de la dependencia organizadora pueden corregirla."}
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
					{withAttendance && (
						<TabsTrigger value="attendance">Asistencia</TabsTrigger>
					)}
					{withAttendance && (
						<TabsTrigger value="materials">Material</TabsTrigger>
					)}
					{gradesAutomatically && (
						<TabsTrigger value="results">Resultados</TabsTrigger>
					)}
					{followUps && (
						<TabsTrigger value="evaluations">Evaluaciones</TabsTrigger>
					)}
					{(withContent || quizBoard) && (
						<TabsTrigger value="progress">
							{withContent ? "Avance" : "Intentos"}
						</TabsTrigger>
					)}
					<TabsTrigger value="completion">Completado</TabsTrigger>
					{MANUAL_ATTENDANCE_ENABLED && withAttendance && detail.qr && (
						<TabsTrigger value="qr">Código QR</TabsTrigger>
					)}
					{ratings && <TabsTrigger value="ratings">Valoraciones</TabsTrigger>}
				</TabsList>
				{withAttendance && (
					<TabsContent
						value="attendance"
						className="flex flex-col gap-4 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start"
					>
						{/* Sin pase de lista, el QR es la forma de tomar asistencia: va
						    junto al registro y no en una pestaña aparte. */}
						{!MANUAL_ATTENDANCE_ENABLED && detail.qr && (
							<CourseQrPanel title={course.title} qr={detail.qr} />
						)}
						<AttendancePanel
							detail={detail}
							manual={MANUAL_ATTENDANCE_ENABLED}
						/>
					</TabsContent>
				)}
				{withAttendance && (
					<TabsContent value="materials">
						<SessionMaterialsPanel courseDocumentId={course.documentId} />
					</TabsContent>
				)}
				{gradesAutomatically && (
					<TabsContent value="results">
						<ResultsPanel detail={detail} />
					</TabsContent>
				)}
				{followUps && (
					<TabsContent value="evaluations">
						<FollowUpBoardPanel
							courseDocumentId={course.documentId}
							board={followUps}
							sessions={detail.sessions}
							participants={detail.participants.map((participant) => ({
								userDocumentId: participant.userDocumentId,
								name: personNameOf(participant),
								marks: participant.marks,
							}))}
						/>
					</TabsContent>
				)}
				{(withContent || quizBoard) && (
					<TabsContent value="progress">
						<ProgressList
							detail={detail}
							quizBoard={quizBoard}
							withContent={withContent}
						/>
					</TabsContent>
				)}
				<TabsContent value="completion" className="flex flex-col gap-4">
					{detail.can.issueCertificates && (
						<IssueCertificatesCard detail={detail} />
					)}
					<CompletionList detail={detail} />
				</TabsContent>
				{MANUAL_ATTENDANCE_ENABLED && withAttendance && detail.qr && (
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
