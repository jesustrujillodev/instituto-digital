import { Pencil } from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { CourseCover } from "@/modules/enrollments/components/course-cover";
import { Button } from "@/shared/components/ui/button";
import type { CourseDetail } from "../domain/course.types";
import {
	COURSE_WIZARD_STEPS,
	type PublishChecklist,
	stepPath,
} from "../utils/course-wizard-steps";
import { CourseAudience } from "./course-audience";
import { CourseAccessBadge, CourseModalityBadge } from "./course-badges";
import { CourseProgram } from "./course-program";
import { CoursePublishChecklist } from "./course-publish-checklist";
import { CourseTrainers } from "./course-trainers";

const [IDENTITY, PROGRAM, ACCESS, RULES] = COURSE_WIZARD_STEPS;

interface CourseReviewStepProps {
	course: CourseDetail;
	checklist: PublishChecklist;
}

/** Último paso: lo capturado, lo que falta y la puerta a publicar. */
export function CourseReviewStep({ course, checklist }: CourseReviewStepProps) {
	const { documentId } = course;

	return (
		<div className="flex flex-col gap-6">
			<CoursePublishChecklist
				documentId={documentId}
				checklist={checklist}
				modality={course.modality}
			/>

			<div className="flex flex-col">
				<ReviewBlock
					documentId={documentId}
					step={IDENTITY.number}
					title={IDENTITY.title}
				>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
						<div className="aspect-video w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5 sm:w-48 sm:shrink-0">
							<CourseCover
								documentId={documentId}
								title={course.title}
								modality={course.modality}
								src={course.coverImageUrl}
								eager
							/>
						</div>
						<div className="flex min-w-0 flex-col gap-1">
							<p className="font-medium text-sm">{course.title}</p>
							<p className="text-muted-foreground text-sm">
								Organiza {course.dependencyName}
							</p>
							{course.description ? (
								<p className="mt-2 max-w-prose whitespace-pre-line text-sm leading-relaxed">
									{course.description}
								</p>
							) : (
								<p className="mt-2 text-muted-foreground text-sm">
									Sin descripción. Es lo primero que lee el personal en el
									catálogo.
								</p>
							)}
						</div>
					</div>
				</ReviewBlock>

				<ReviewBlock
					documentId={documentId}
					step={PROGRAM.number}
					title={PROGRAM.title}
					aside={<CourseModalityBadge modality={course.modality} />}
				>
					<CourseProgram
						sessions={course.sessions}
						modality={course.modality}
					/>
				</ReviewBlock>

				<ReviewBlock
					documentId={documentId}
					step={ACCESS.number}
					title={ACCESS.title}
					aside={<CourseAccessBadge access={course.access} />}
				>
					<div className="flex flex-col gap-5">
						<CourseTrainers trainers={course.trainers} />
						<CourseAudience access={course.access} audience={course.audience} />
						<ReviewFacts
							facts={[
								{
									term: "Cupo",
									value:
										course.capacity === null
											? "Sin límite"
											: `${course.capacity} lugares`,
								},
								{
									term: "Cierre de inscripción",
									value: course.enrollmentDeadline
										? formatZonedDate(new Date(course.enrollmentDeadline))
										: "Al iniciar la primera sesión",
								},
							]}
						/>
					</div>
				</ReviewBlock>

				<ReviewBlock
					documentId={documentId}
					step={RULES.number}
					title={RULES.title}
				>
					<ReviewFacts
						facts={[
							{
								term: "Asistencia mínima",
								value: `${course.minAttendance} %`,
							},
							{
								term: "Evaluación",
								value: course.requiresEvaluation
									? "Aprobado / no aprobado"
									: "Sin evaluación",
							},
							{
								term: "Ventana del QR",
								value: `Se activa ${course.qrOpensBeforeMinutes} min antes y se cierra ${course.qrClosesAfterMinutes} min después de cada sesión`,
							},
						]}
					/>
				</ReviewBlock>
			</div>
		</div>
	);
}

function ReviewBlock({
	documentId,
	step,
	title,
	aside,
	children,
}: {
	documentId: string;
	step: number;
	title: string;
	aside?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-4 border-border border-t py-5 first:border-t-0 first:pt-0 last:pb-0">
			<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="font-medium text-base">{title}</h3>
					{aside}
				</div>
				<Button variant="ghost" size="sm" asChild>
					<Link to={stepPath(documentId, step)}>
						<Pencil aria-hidden="true" />
						Editar
						<span className="sr-only"> {title}</span>
					</Link>
				</Button>
			</header>
			{children}
		</section>
	);
}

function ReviewFacts({
	facts,
}: {
	facts: readonly { term: string; value: string }[];
}) {
	return (
		<dl className="grid gap-3 sm:grid-cols-2">
			{facts.map(({ term, value }) => (
				<div key={term} className="flex flex-col gap-0.5">
					<dt className="text-muted-foreground text-xs">{term}</dt>
					<dd className="text-sm">{value}</dd>
				</div>
			))}
		</dl>
	);
}
