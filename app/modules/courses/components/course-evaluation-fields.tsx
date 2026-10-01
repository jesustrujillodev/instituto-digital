import { Award, ClipboardCheck, Info } from "lucide-react";
import { memo, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/shared/components/ui/input";
import {
	countsContent,
	gradesAutomatically,
	requiresSessions,
} from "../domain/course.rules";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import { accreditationStepsOf } from "../utils/accreditation";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import {
	type CompletionContentFacts,
	CourseCompletionChecklist,
} from "./course-completion-checklist";

const numberOr = (value: string, fallback: number) => {
	const parsed = Number(value);
	return value.trim() === "" || Number.isNaN(parsed) ? fallback : parsed;
};

/** «Así se acredita»: los requisitos de abajo dichos en frases. */
function AccreditationSummary({ steps }: { steps: readonly string[] }) {
	return (
		<section className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-4">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground">
				<Award className="size-4" aria-hidden="true" />
			</span>
			<div className="flex min-w-0 flex-col gap-1.5">
				<h3 className="font-semibold text-sm">Así se acredita</h3>
				<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
					{steps.map((step) => (
						<li key={step}>{step}</li>
					))}
				</ol>
			</div>
		</section>
	);
}

function GradeChip({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 font-medium text-sm">
			<ClipboardCheck
				className="size-4 text-muted-foreground"
				aria-hidden="true"
			/>
			{children}
		</span>
	);
}

/**
 * Lo que decide si alguien completa el curso y obtiene su crédito, y cómo se le
 * evalúa. El examen y las evaluaciones de seguimiento se guardan por su cuenta
 * y llegan ya pintados desde el módulo de contenido.
 */
export const CourseEvaluationFields = memo(function CourseEvaluationFields({
	ids,
	isPublished = false,
	followUps,
	countedFollowUpTitles = [],
	quiz,
	quizSummary,
	content,
	contentHref,
}: {
	ids: CourseFormIds;
	isPublished?: boolean;
	followUps?: ReactNode;
	/** Las de seguimiento que entran al promedio. */
	countedFollowUpTitles?: readonly string[];
	/** El editor del examen: se guarda al continuar, fuera del formulario. */
	quiz?: ReactNode;
	/** "5 preguntas · 5 puntos · se aprueba con 4". */
	quizSummary?: string | null;
	/** Lo que el temario aporta; `null` si el curso todavía no tiene. */
	content: CompletionContentFacts | null;
	contentHref: string | null;
}) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const [
		format,
		requiresEvaluation,
		completionRule,
		minAttendance,
		minPassing,
	] = useWatch<
		CourseFormValues,
		[
			"format",
			"requiresEvaluation",
			"completionRule",
			"minAttendance",
			"minPassingGrade",
		]
	>({
		name: [
			"format",
			"requiresEvaluation",
			"completionRule",
			"minAttendance",
			"minPassingGrade",
		],
	});

	const scheduled = requiresSessions(format);
	// Un autogestivo publicado ya otorga créditos: cambiar cómo se completa
	// mediría a unos con un criterio y a otros con otro (docs/adr/0014).
	const locked = isPublished && !scheduled;
	const countedFollowUps = scheduled ? countedFollowUpTitles.length : 0;
	const automatic = gradesAutomatically(
		{ requiresEvaluation, completionRule },
		countedFollowUps,
	);

	const steps = accreditationStepsOf({
		scheduled,
		completionRule,
		minAttendance: numberOr(minAttendance, 0),
		requiresEvaluation,
		minPassingGrade: numberOr(minPassing, 0),
		requiredLessons: content?.requiredLessons ?? null,
		moduleEvaluations: content?.moduleEvaluations ?? 0,
		countedFollowUps,
	});

	const chips = [
		...(requiresEvaluation ? ["Examen final"] : []),
		...(countsContent(completionRule) ? ["Evaluaciones del temario"] : []),
		...(scheduled ? countedFollowUpTitles : []),
	];

	return (
		<div className="flex flex-col gap-8">
			<AccreditationSummary steps={steps} />

			{automatic && (
				<section
					className="flex flex-col gap-4 rounded-xl border border-border bg-card px-5 py-5"
					aria-labelledby={`${ids.minPassingGrade}-title`}
				>
					<div className="flex flex-col gap-1">
						<h3
							id={`${ids.minPassingGrade}-title`}
							className="font-bold text-lg"
						>
							Calificación mínima de la capacitación{" "}
							<span className="text-destructive" aria-hidden="true">
								*
							</span>
						</h3>
						<p className="text-muted-foreground text-sm">
							La plataforma promedia las calificaciones de cada participante y
							decide sola si acredita.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-2 text-sm">
						{chips.map((chip, index) => (
							<span key={chip} className="flex items-center gap-2">
								{index > 0 && (
									<span className="text-muted-foreground" aria-hidden="true">
										+
									</span>
								)}
								<GradeChip>{chip}</GradeChip>
							</span>
						))}
						<span className="text-muted-foreground">
							→ promedio de las mejores calificaciones, igual o mayor a
						</span>
						<span className="relative">
							<Input
								id={ids.minPassingGrade}
								type="number"
								inputMode="numeric"
								min={0}
								max={100}
								readOnly={isPublished}
								aria-label="Calificación mínima aprobatoria (%)"
								aria-invalid={Boolean(errors.minPassingGrade)}
								className="h-10 w-24 pr-8 font-semibold tabular-nums"
								{...register("minPassingGrade")}
							/>
							<span
								aria-hidden="true"
								className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm"
							>
								%
							</span>
						</span>
					</div>

					{errors.minPassingGrade?.message && (
						<span role="alert" className="text-destructive text-sm">
							{errors.minPassingGrade.message}
						</span>
					)}
					<p className="flex items-start gap-2 text-muted-foreground text-xs">
						<Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
						{isPublished
							? "La capacitación ya está publicada: la calificación mínima no se puede cambiar."
							: "Se acredita aunque alguna evaluación quede reprobada, siempre que el promedio llegue al mínimo y se cumplan los requisitos."}
					</p>
				</section>
			)}

			<CourseCompletionChecklist
				ids={ids}
				scheduled={scheduled}
				locked={locked}
				isPublished={isPublished}
				content={content}
				contentHref={contentHref}
				finalExam={quiz}
				finalExamSummary={quizSummary}
			/>

			{/* El seguimiento cuelga del pase de lista de cada sesión: un
			    autogestivo no lo tiene. No depende de la evaluación final. */}
			{scheduled && followUps}
		</div>
	);
});
