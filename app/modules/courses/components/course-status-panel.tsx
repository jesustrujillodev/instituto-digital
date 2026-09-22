import {
	ArrowRight,
	Ban,
	ClipboardCheck,
	LayoutList,
	Send,
	Users,
} from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import type {
	CourseFormat,
	CourseModality,
	CourseStatus,
	PublishCheck,
} from "../domain/course.rules";
import { requiresContent } from "../domain/course.rules";
import {
	firstPendingStep,
	LAST_STEP_NUMBER,
	stepPath,
} from "../utils/course-wizard-steps";
import type { CourseEnrollmentSummary } from "../utils/to-enrollment-summary";
import { CoursePublishChecklist } from "./course-publish-checklist";

interface CourseStatusPanelProps {
	documentId: string;
	status: CourseStatus;
	modality: CourseModality;
	format: CourseFormat;
	cancelledAt: Date | string | null;
	checklist: readonly { check: PublishCheck; done: boolean }[] | null;
	enrollment: CourseEnrollmentSummary;
	canTeach: boolean;
	canCancel: boolean;
	isChangingStatus: boolean;
	isPublishing: boolean;
	onCancel: () => void;
	onPublish: () => void;
}

/**
 * Lo siguiente que le toca al curso según su estado: los pendientes de un
 * borrador, la inscripción de un publicado o el cierre de uno terminado.
 */
export function CourseStatusPanel({
	documentId,
	status,
	modality,
	format,
	cancelledAt,
	checklist,
	enrollment,
	canTeach,
	canCancel,
	isChangingStatus,
	isPublishing,
	onCancel,
	onPublish,
}: CourseStatusPanelProps) {
	const rosterPath = `/dashboard/cursos/${documentId}/inscripciones`;
	const teachingPath = `/dashboard/imparticion/${documentId}`;
	const contentPath = `/dashboard/cursos/${documentId}/contenido`;

	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-4">
				{checklist && (
					<div className="flex flex-col gap-3">
						<CoursePublishChecklist
							documentId={documentId}
							checklist={checklist}
							modality={modality}
						/>

						{/* La puerta y la acción que la cruza viven juntas: publicar solo
						    aparece cuando la lista de arriba ya no tiene pendientes. */}
						{checklist.every((entry) => entry.done) ? (
							<div className="flex flex-col gap-2">
								<Button
									type="button"
									disabled={isChangingStatus}
									onClick={onPublish}
								>
									<Send aria-hidden="true" />
									{isPublishing ? "Publicando…" : "Publicar"}
								</Button>
								<Button variant="ghost" size="sm" asChild>
									<Link to={stepPath(documentId, LAST_STEP_NUMBER)}>
										Revisar antes de publicar
									</Link>
								</Button>
							</div>
						) : (
							<Button asChild>
								<Link
									to={stepPath(documentId, firstPendingStep(checklist, format))}
								>
									Continuar el alta
									<ArrowRight className="ml-auto" aria-hidden="true" />
								</Link>
							</Button>
						)}
					</div>
				)}

				{status !== "DRAFT" && (
					<EnrollmentFigures
						status={status}
						enrollment={enrollment}
						note={
							status === "CANCELLED" && cancelledAt
								? `Cancelado el ${formatZonedDate(new Date(cancelledAt))}. Se conserva tal como quedó.`
								: null
						}
					/>
				)}

				{status !== "DRAFT" && (
					<div className="flex flex-col gap-2">
						{canTeach && (
							<Button asChild>
								<Link to={teachingPath}>
									<ClipboardCheck aria-hidden="true" />
									{status === "FINISHED"
										? "Resultados y valoraciones"
										: "Pasar lista"}
								</Link>
							</Button>
						)}
						<Button asChild variant="outline">
							<Link to={rosterPath}>
								<Users aria-hidden="true" />
								{status === "PUBLISHED"
									? "Inscribir personal"
									: "Ver inscripciones"}
								<ArrowRight className="ml-auto" aria-hidden="true" />
							</Link>
						</Button>
						{/* El borrador edita su temario desde el paso del alta; el
						    publicado ya no pasa por ahí y necesita su propia puerta. */}
						{requiresContent(format) && (
							<Button asChild variant="outline">
								<Link to={contentPath}>
									<LayoutList aria-hidden="true" />
									Contenido del curso
									<ArrowRight className="ml-auto" aria-hidden="true" />
								</Link>
							</Button>
						)}
					</div>
				)}

				{canCancel && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
						disabled={isChangingStatus}
						onClick={onCancel}
					>
						<Ban aria-hidden="true" />
						Cancelar curso
					</Button>
				)}
			</CardContent>
		</Card>
	);
}

function EnrollmentFigures({
	status,
	enrollment,
	note,
}: {
	status: CourseStatus;
	enrollment: CourseEnrollmentSummary;
	/** Sustituye a la línea de cierre: un cancelado ya no cierra nada. */
	note: string | null;
}) {
	const { enrolled, invited, capacity, seatsLeft, closesAt, isOpen } =
		enrollment;

	const closing =
		closesAt === null
			? null
			: `${isOpen ? "Cierra" : "Cerró"} el ${formatZonedDate(new Date(closesAt))}`;

	return (
		<section
			aria-labelledby="enrollment-figures"
			className="flex flex-col gap-3"
		>
			<div className="flex flex-col gap-0.5">
				<h2 id="enrollment-figures" className="font-medium text-base">
					Inscripción
				</h2>
				{note ? (
					<p className="text-muted-foreground text-sm">{note}</p>
				) : (
					status === "PUBLISHED" &&
					closing && <p className="text-muted-foreground text-sm">{closing}</p>
				)}
			</div>

			<dl className="grid grid-cols-2 gap-3">
				<div className="flex flex-col gap-0.5">
					<dt className="text-muted-foreground text-xs">Inscritos</dt>
					<dd className="font-medium text-sm tabular-nums">
						{capacity === null ? enrolled : `${enrolled} de ${capacity}`}
					</dd>
				</div>
				{status === "PUBLISHED" && (
					<div className="flex flex-col gap-0.5">
						<dt className="text-muted-foreground text-xs">
							{seatsLeft === null ? "Cupo" : "Lugares libres"}
						</dt>
						<dd className="font-medium text-sm tabular-nums">
							{seatsLeft === null ? "Sin límite" : seatsLeft}
						</dd>
					</div>
				)}
				{invited > 0 && (
					<div className="flex flex-col gap-0.5">
						<dt className="text-muted-foreground text-xs">
							Invitaciones sin responder
						</dt>
						<dd className="font-medium text-sm tabular-nums">{invited}</dd>
					</div>
				)}
			</dl>
		</section>
	);
}
