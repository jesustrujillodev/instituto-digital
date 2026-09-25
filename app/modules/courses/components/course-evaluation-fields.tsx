import { memo, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { requiresSessions } from "../domain/course.rules";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { EVALUATION_METHOD_LABELS } from "../utils/course-labels";
import { type ChoiceOption, CourseChoiceField } from "./course-choice-field";
import {
	type CompletionContentFacts,
	CourseCompletionChecklist,
} from "./course-completion-checklist";

const methodOptions = (scheduled: boolean): ChoiceOption[] => [
	{
		value: "QUIZ",
		label: EVALUATION_METHOD_LABELS.QUIZ,
		description: "Un intento. La calificación se asigna sola.",
	},
	{
		value: "MANUAL",
		label: EVALUATION_METHOD_LABELS.MANUAL,
		description: scheduled
			? "Quien imparte captura aprobado o no aprobado de cada participante."
			: "Un autogestivo no tiene capacitador que capture resultados.",
		disabled: !scheduled,
	},
];

/**
 * Lo que decide si alguien completa el curso y obtiene su crédito, y cómo se le
 * evalúa. El examen y las evaluaciones de seguimiento se guardan por su cuenta
 * y llegan ya pintados desde su módulo.
 */
export const CourseEvaluationFields = memo(function CourseEvaluationFields({
	ids,
	isPublished = false,
	evaluations,
	quiz,
	quizSummary,
	content,
	contentHref,
}: {
	ids: CourseFormIds;
	isPublished?: boolean;
	evaluations?: ReactNode;
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
	const format = useWatch<CourseFormValues, "format">({ name: "format" });
	const requiresEvaluation = useWatch<CourseFormValues, "requiresEvaluation">({
		name: "requiresEvaluation",
	});
	const evaluationMethod = useWatch<CourseFormValues, "evaluationMethod">({
		name: "evaluationMethod",
	});

	const scheduled = requiresSessions(format);
	// Un autogestivo publicado ya otorga créditos: cambiar cómo se completa
	// mediría a unos con un criterio y a otros con otro (docs/adr/0014).
	const locked = isPublished && !scheduled;
	const byQuiz = evaluationMethod === "QUIZ";

	return (
		<>
			<CourseCompletionChecklist
				ids={ids}
				scheduled={scheduled}
				locked={locked}
				content={content}
				contentHref={contentHref}
			/>

			{scheduled && (
				<fieldset className="flex flex-col gap-3">
					<legend className="mb-1 font-medium text-sm">
						Ventana del código QR
					</legend>
					<p className="text-muted-foreground text-sm">
						Quien llega a una sesión escanea su QR para registrar su asistencia.
						Decide cuánto antes se activa y cuánto después deja de aceptar
						registros.
					</p>

					<div className="grid items-start gap-4 sm:grid-cols-2">
						<TextInput
							id={ids.qrOpensBeforeMinutes}
							label="Se activa (minutos antes)"
							type="number"
							min={0}
							max={240}
							error={errors.qrOpensBeforeMinutes?.message}
							{...register("qrOpensBeforeMinutes")}
						/>
						<TextInput
							id={ids.qrClosesAfterMinutes}
							label="Se cierra (minutos después)"
							type="number"
							min={0}
							max={240}
							error={errors.qrClosesAfterMinutes?.message}
							{...register("qrClosesAfterMinutes")}
						/>
					</div>
				</fieldset>
			)}

			{requiresEvaluation && (
				<section
					className="flex flex-col gap-5"
					aria-labelledby={`${ids.evaluationMethod}-title`}
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h3
							id={`${ids.evaluationMethod}-title`}
							className="font-bold text-lg"
						>
							Evaluación final
						</h3>
						{byQuiz && quizSummary && (
							<span className="text-muted-foreground text-xs tabular-nums">
								{quizSummary}
							</span>
						)}
					</div>

					<CourseChoiceField
						id={ids.evaluationMethod}
						name="evaluationMethod"
						legend="Se evalúa con"
						required
						options={methodOptions(scheduled)}
						disabled={isPublished}
						helperText={
							isPublished
								? "El curso ya está publicado: la vía de evaluación no se puede cambiar."
								: undefined
						}
					/>

					{byQuiz && quiz}
				</section>
			)}

			{/* Las de seguimiento las captura quien imparte, y un autogestivo no
			    tiene capacitador. */}
			{requiresEvaluation && scheduled && evaluations}
		</>
	);
});
