import { memo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { CourseFormSection } from "./course-form-section";

export const RULES_DESCRIPTION =
	"Completa el curso quien alcanza la asistencia mínima y, si hay evaluación, aprueba. Completar da el crédito.";

/** Lo que decide si alguien completa el curso y obtiene su crédito. */
export const CourseRulesFields = memo(function CourseRulesFields({
	ids,
}: {
	ids: CourseFormIds;
}) {
	const {
		register,
		control,
		formState: { errors },
	} = useFormContext<CourseFormValues>();

	return (
		<>
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

			<Controller
				control={control}
				name="requiresEvaluation"
				render={({ field }) => (
					<div className="flex items-start gap-3">
						<Checkbox
							id={ids.requiresEvaluation}
							checked={field.value}
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
								Quien imparte captura aprobado o no aprobado de cada
								participante.
							</span>
						</Label>
					</div>
				)}
			/>

			<fieldset className="flex flex-col gap-3">
				<legend className="mb-1 font-medium text-sm">
					Ventana del código QR
				</legend>
				<p className="max-w-prose text-muted-foreground text-sm">
					Quien llega a una sesión escanea su QR para registrarse. Decide cuánto
					antes se activa y cuánto después deja de aceptar registros.
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
		</>
	);
});

export function CourseAttendanceSection({ ids }: { ids: CourseFormIds }) {
	return (
		<CourseFormSection section="attendance" description={RULES_DESCRIPTION}>
			<CourseRulesFields ids={ids} />
		</CourseFormSection>
	);
}
