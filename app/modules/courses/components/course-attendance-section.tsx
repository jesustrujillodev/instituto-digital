import { memo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { CourseFormSection } from "./course-form-section";

/** Lo que decide si alguien completa el curso y obtiene su crédito. */
export const CourseAttendanceSection = memo(function CourseAttendanceSection({
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
		<CourseFormSection
			section="attendance"
			description="Completa el curso quien alcanza la asistencia mínima y, si hay evaluación, aprueba. Completar da el crédito."
		>
			<div className="grid items-start gap-4 sm:grid-cols-3">
				<TextInput
					id={ids.minAttendance}
					label="Asistencia mínima (%)"
					type="number"
					min={1}
					max={100}
					required
					error={errors.minAttendance?.message}
					{...register("minAttendance")}
				/>
				<TextInput
					id={ids.qrOpensBeforeMinutes}
					label="El QR abre (min antes)"
					type="number"
					min={0}
					max={240}
					helperText="Antes del inicio de cada sesión"
					error={errors.qrOpensBeforeMinutes?.message}
					{...register("qrOpensBeforeMinutes")}
				/>
				<TextInput
					id={ids.qrClosesAfterMinutes}
					label="El QR cierra (min después)"
					type="number"
					min={0}
					max={240}
					helperText="Después del fin de cada sesión"
					error={errors.qrClosesAfterMinutes?.message}
					{...register("qrClosesAfterMinutes")}
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
		</CourseFormSection>
	);
});
