import { Pencil } from "lucide-react";
import { Link } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import type { ContentSummary } from "@/modules/content/domain/content.types";
import { CourseCover } from "@/modules/enrollments/components/course-cover";
import { Button } from "@/shared/components/ui/button";
import { countsAttendance, requiresSessions } from "../domain/course.rules";
import type { CourseDetail } from "../domain/course.types";
import {
	COMPLETION_RULE_LABELS,
	EVALUATION_METHOD_LABELS,
} from "../utils/course-labels";
import {
	type PublishChecklist,
	stepOfKey,
	stepPath,
} from "../utils/course-wizard-steps";
import { CourseAudience } from "./course-audience";
import {
	CourseAccessBadge,
	CourseFormatBadge,
	CourseModalityBadge,
} from "./course-badges";
import { CourseProgram } from "./course-program";
import { CoursePublishChecklist } from "./course-publish-checklist";
import { CourseTrainers } from "./course-trainers";

// Por clave y no por posición: insertar un paso no puede reasignar en silencio
// a qué bloque apunta cada botón de editar.
const IDENTITY = stepOfKey("identity");
const PROGRAM = stepOfKey("program");
const ACCESS = stepOfKey("access");
const RULES = stepOfKey("rules");
const CONTENT = stepOfKey("content");

interface CourseReviewStepProps {
	course: CourseDetail;
	checklist: PublishChecklist;
	/** El temario, solo cuando el curso lo pide. */
	content: ContentSummary | null;
	evaluationTitles: readonly string[];
	/** Preguntas del examen guardado; solo cuenta si se evalúa con examen. */
	quizQuestionCount: number;
}

const evaluationLabel = (course: CourseDetail, quizQuestionCount: number) => {
	if (!course.requiresEvaluation) return "Sin evaluación";
	if (course.evaluationMethod === "MANUAL") {
		return EVALUATION_METHOD_LABELS.MANUAL;
	}
	return `${EVALUATION_METHOD_LABELS.QUIZ} · ${
		quizQuestionCount === 1 ? "1 pregunta" : `${quizQuestionCount} preguntas`
	}`;
};

/** Último paso: lo capturado, lo que falta y la puerta a publicar. */
export function CourseReviewStep({
	course,
	checklist,
	content,
	evaluationTitles,
	quizQuestionCount,
}: CourseReviewStepProps) {
	const { documentId } = course;
	const scheduled = requiresSessions(course.format);

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
								<p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
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
					aside={
						scheduled ? (
							<CourseModalityBadge modality={course.modality} />
						) : (
							<CourseFormatBadge format={course.format} />
						)
					}
				>
					<div className="flex flex-col gap-5">
						<CourseTrainers trainers={course.trainers} />
						{scheduled ? (
							<CourseProgram
								sessions={course.sessions}
								modality={course.modality}
							/>
						) : (
							<p className="text-muted-foreground text-sm">
								Sin sesiones: quien se inscribe recorre el curso a su ritmo.
							</p>
						)}
					</div>
				</ReviewBlock>

				{content ? (
					<ReviewBlock
						documentId={documentId}
						step={CONTENT.number}
						title={CONTENT.title}
					>
						{content.lessonCount === 0 ? (
							<p className="text-muted-foreground text-sm">
								Sin temario todavía. Es lo único que este curso da a recorrer.
							</p>
						) : (
							<ReviewFacts
								facts={[
									{ term: "Módulos", value: `${content.moduleCount}` },
									{
										term: "Lecciones",
										value: `${content.lessonCount}, ${content.requiredLessonCount} obligatorias`,
									},
								]}
							/>
						)}
					</ReviewBlock>
				) : null}
				<ReviewBlock
					documentId={documentId}
					step={RULES.number}
					title={RULES.title}
				>
					<ReviewFacts
						facts={[
							{
								term: "Se completa con",
								value: COMPLETION_RULE_LABELS[course.completionRule],
							},
							...(countsAttendance(course.completionRule)
								? [
										{
											term: "Asistencia mínima",
											value: `${course.minAttendance} %`,
										},
									]
								: []),
							{
								term: "Evaluación",
								value: evaluationLabel(course, quizQuestionCount),
							},
							...(course.requiresEvaluation && evaluationTitles.length > 0
								? [
										{
											term: "Evaluaciones de seguimiento",
											value: evaluationTitles.join(", "),
										},
									]
								: []),
							...(scheduled
								? [
										{
											term: "Ventana del QR",
											value: `Se activa ${course.qrOpensBeforeMinutes} min antes y se cierra ${course.qrClosesAfterMinutes} min después de cada sesión`,
										},
									]
								: []),
						]}
					/>
				</ReviewBlock>

				<ReviewBlock
					documentId={documentId}
					step={ACCESS.number}
					title={ACCESS.title}
					aside={<CourseAccessBadge access={course.access} />}
				>
					<div className="flex flex-col gap-5">
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
