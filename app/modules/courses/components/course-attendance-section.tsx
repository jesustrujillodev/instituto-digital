import { memo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
	COURSE_COMPLETION_RULES,
	countsAttendance,
	requiresSessions,
} from "../domain/course.rules";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { COMPLETION_RULE_LABELS } from "../utils/course-labels";
import { CourseFormSection } from "./course-form-section";
import { CourseSelectField } from "./course-select-field";

export const RULES_DESCRIPTION =
	"Qué hace falta para completar el curso y obtener el crédito.";

const RULE_OPTIONS = COURSE_COMPLETION_RULES.map((value) => ({
	value,
	label: COMPLETION_RULE_LABELS[value],
}));

const RULE_HINTS: Record<(typeof COURSE_COMPLETION_RULES)[number], string> = {
	ATTENDANCE:
		"Completa quien alcanza la asistencia mínima y, si hay evaluación, aprueba.",
	CONTENT:
		"Completa quien termina las lecciones obligatorias y, si hay evaluación, aprueba.",
	BOTH: "Completa quien alcanza la asistencia mínima, termina las lecciones obligatorias y, si hay evaluación, aprueba.",
};

/** Lo que decide si alguien completa el curso y obtiene su crédito. */
export const CourseRulesFields = memo(function CourseRulesFields({
	ids,
	isPublished = false,
}: {
	ids: CourseFormIds;
	isPublished?: boolean;
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

	const scheduled = requiresSessions(format);
	const byAttendance = countsAttendance(completionRule);
	// Un autogestivo publicado ya otorga créditos: cambiar cómo se completa
	// mediría a unos con un criterio y a otros con otro (docs/adr/0014).
	const locked = isPublished && !scheduled;

	return (
		<>
			<div className="sm:max-w-xs">
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
			</div>

			{byAttendance && (
				<div className="sm:max-w-xs">
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
				</div>
			)}

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
									: "Quien imparte captura aprobado o no aprobado de cada participante."}
							</span>
						</Label>
					</div>
				)}
			/>

			{scheduled && (
				<fieldset className="flex flex-col gap-3">
					<legend className="mb-1 font-medium text-sm">
						Ventana del código QR
					</legend>
					<p className="max-w-prose text-muted-foreground text-sm">
						Quien llega a una sesión escanea su QR para registrarse. Decide
						cuánto antes se activa y cuánto después deja de aceptar registros.
					</p>

					<div className="grid items-start gap-4 sm:max-w-md sm:grid-cols-2">
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
		</>
	);
});

export function CourseAttendanceSection({
	ids,
	isPublished,
}: {
	ids: CourseFormIds;
	isPublished: boolean;
}) {
	return (
		<CourseFormSection section="attendance" description={RULES_DESCRIPTION}>
			<CourseRulesFields ids={ids} isPublished={isPublished} />
		</CourseFormSection>
	);
}
