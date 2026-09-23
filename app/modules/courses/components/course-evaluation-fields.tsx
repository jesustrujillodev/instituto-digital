import { memo, type ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
	COURSE_COMPLETION_RULES,
	countsAttendance,
	EVALUATION_METHODS,
	requiresSessions,
} from "../domain/course.rules";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import {
	COMPLETION_RULE_LABELS,
	EVALUATION_METHOD_LABELS,
} from "../utils/course-labels";
import { CourseSelectField } from "./course-select-field";

const RULE_OPTIONS = COURSE_COMPLETION_RULES.map((value) => ({
	value,
	label: COMPLETION_RULE_LABELS[value],
}));

const METHOD_OPTIONS = EVALUATION_METHODS.map((value) => ({
	value,
	label: EVALUATION_METHOD_LABELS[value],
}));

const RULE_HINTS: Record<(typeof COURSE_COMPLETION_RULES)[number], string> = {
	ATTENDANCE:
		"Completa quien alcanza la asistencia mínima y, si hay evaluación, aprueba.",
	CONTENT:
		"Completa quien termina las lecciones obligatorias y, si hay evaluación, aprueba.",
	BOTH: "Completa quien alcanza la asistencia mínima, termina las lecciones obligatorias y, si hay evaluación, aprueba.",
};

/**
 * Lo que decide si alguien completa el curso y obtiene su crédito, y cómo se le
 * evalúa. Las evaluaciones de seguimiento se guardan por su cuenta y llegan ya
 * pintadas desde su módulo.
 */
export const CourseEvaluationFields = memo(function CourseEvaluationFields({
	ids,
	isPublished = false,
	evaluations,
	quiz,
}: {
	ids: CourseFormIds;
	isPublished?: boolean;
	evaluations?: ReactNode;
	/** El editor del examen: se guarda por su cuenta, como las evaluaciones. */
	quiz?: ReactNode;
}) {
	const {
		register,
		control,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const format = useWatch<CourseFormValues, "format">({ name: "format" });
	const completionRule = useWatch<CourseFormValues, "completionRule">({
		name: "completionRule",
	});
	const requiresEvaluation = useWatch<CourseFormValues, "requiresEvaluation">({
		name: "requiresEvaluation",
	});
	const evaluationMethod = useWatch<CourseFormValues, "evaluationMethod">({
		name: "evaluationMethod",
	});

	const scheduled = requiresSessions(format);
	const byAttendance = countsAttendance(completionRule);
	// Un autogestivo publicado ya otorga créditos: cambiar cómo se completa
	// mediría a unos con un criterio y a otros con otro (docs/adr/0014).
	const locked = isPublished && !scheduled;

	return (
		<>
			<div className="grid items-start gap-4 sm:grid-cols-2">
				<CourseSelectField
					id={ids.completionRule}
					name="completionRule"
					label="Se completa con"
					required
					options={
						scheduled
							? RULE_OPTIONS
							: RULE_OPTIONS.filter((option) => option.value === "CONTENT")
					}
					disabled={locked}
					helperText={RULE_HINTS[completionRule]}
				/>
				{byAttendance && (
					<TextInput
						id={ids.minAttendance}
						label="Asistencia mínima (%)"
						type="number"
						min={1}
						max={100}
						required
						helperText="Sobre el total de sesiones del curso."
						error={errors.minAttendance?.message}
						{...register("minAttendance")}
					/>
				)}
			</div>

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

			<div className="flex flex-col gap-4 border-border border-t pt-6">
				<Controller
					control={control}
					name="requiresEvaluation"
					render={({ field }) => (
						<div className="flex items-start gap-3">
							<Checkbox
								id={ids.requiresEvaluation}
								checked={field.value}
								disabled={locked}
								onCheckedChange={(checked) => field.onChange(checked === true)}
								onBlur={field.onBlur}
								className="mt-0.5"
							/>
							<Label
								htmlFor={ids.requiresEvaluation}
								className="flex flex-col items-start gap-0.5 font-normal"
							>
								<span>Requiere evaluación</span>
								<span className="text-muted-foreground text-xs">
									{locked
										? "El curso ya está publicado y otorga créditos: no se puede cambiar."
										: "El resultado de cada participante: aprobado o no aprobado, con su nota."}
								</span>
							</Label>
						</div>
					)}
				/>

				{requiresEvaluation && (
					<CourseSelectField
						id={ids.evaluationMethod}
						name="evaluationMethod"
						label="Se evalúa con"
						required
						options={METHOD_OPTIONS}
						disabled={isPublished}
						helperText={
							isPublished
								? "El curso ya está publicado: la vía de evaluación no se puede cambiar."
								: evaluationMethod === "QUIZ"
									? "Cada participante presenta un examen, con un solo intento. Su nota y su resultado se escriben solos."
									: "Quien imparte captura aprobado o no aprobado de cada participante."
						}
					/>
				)}

				{requiresEvaluation && evaluationMethod === "QUIZ" && quiz && (
					<fieldset className="flex flex-col gap-3">
						<legend className="mb-1 font-medium text-sm">Examen final</legend>
						{quiz}
					</fieldset>
				)}

				{requiresEvaluation && evaluations}
			</div>
		</>
	);
});
