import {
	ArrowRight,
	Ban,
	CircleCheck,
	CircleDashed,
	ClipboardCheck,
	Users,
} from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import type {
	CourseModality,
	CourseStatus,
	PublishCheck,
} from "../domain/course.rules";
import { publishCheckLabel } from "../utils/course-labels";
import type { CourseEnrollmentSummary } from "../utils/to-enrollment-summary";

interface CourseStatusPanelProps {
	documentId: string;
	status: CourseStatus;
	modality: CourseModality;
	cancelledAt: Date | string | null;
	checklist: readonly { check: PublishCheck; done: boolean }[] | null;
	enrollment: CourseEnrollmentSummary;
	canTeach: boolean;
	canCancel: boolean;
	isChangingStatus: boolean;
	onCancel: () => void;
}

/**
 * Lo siguiente que le toca al curso según su estado: los pendientes de un
 * borrador, la inscripción de un publicado o el cierre de uno terminado.
 */
export function CourseStatusPanel({
	documentId,
	status,
	modality,
	cancelledAt,
	checklist,
	enrollment,
	canTeach,
	canCancel,
	isChangingStatus,
	onCancel,
}: CourseStatusPanelProps) {
	const rosterPath = `/dashboard/cursos/${documentId}/inscripciones`;
	const teachingPath = `/dashboard/imparticion/${documentId}`;

	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-4">
				{checklist && (
					<PublishChecklist checklist={checklist} modality={modality} />
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
									? "Inscribir e invitar"
									: "Ver inscripciones"}
								<ArrowRight className="ml-auto" aria-hidden="true" />
							</Link>
						</Button>
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

function PublishChecklist({
	checklist,
	modality,
}: {
	checklist: readonly { check: PublishCheck; done: boolean }[];
	modality: CourseModality;
}) {
	const pending = checklist.filter((entry) => !entry.done).length;

	return (
		<section
			aria-labelledby="publish-checklist"
			className="flex flex-col gap-3"
		>
			<div className="flex flex-col gap-0.5">
				<h2 id="publish-checklist" className="font-medium text-base">
					Para publicar
				</h2>
				<p className="text-muted-foreground text-sm">
					{pending === 0
						? "Todo listo. Al publicar, el curso aparece a su audiencia."
						: pending === 1
							? "Falta una cosa. Complétala desde Editar."
							: `Faltan ${pending} cosas. Complétalas desde Editar.`}
				</p>
			</div>

			<ul className="flex flex-col gap-2">
				{checklist.map(({ check, done }) => (
					<li key={check} className="flex items-start gap-2 text-sm">
						{done ? (
							<CircleCheck
								className="mt-0.5 size-4 shrink-0 text-success-foreground"
								aria-hidden="true"
							/>
						) : (
							<CircleDashed
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
						)}
						<span className={done ? undefined : "text-muted-foreground"}>
							{publishCheckLabel(check, modality)}
							<span className="sr-only">
								{done ? ": listo" : ": pendiente"}
							</span>
						</span>
					</li>
				))}
			</ul>
		</section>
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
