import { memo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import { COURSE_ACCESS_TYPES, COURSE_MODALITIES } from "../domain/course.rules";
import type { CourseAudienceOption } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { ACCESS_LABELS, MODALITY_LABELS } from "../utils/course-labels";
import { CourseCoverField } from "./course-cover-field";
import { CourseSelectField } from "./course-select-field";

const MODALITY_OPTIONS = COURSE_MODALITIES.map((value) => ({
	value,
	label: MODALITY_LABELS[value],
}));

const ACCESS_OPTIONS = COURSE_ACCESS_TYPES.map((value) => ({
	value,
	label: ACCESS_LABELS[value],
}));

interface CourseGeneralSectionProps {
	ids: CourseFormIds;
	/** `null` cuando la organizadora no se elige: se hereda del alcance. */
	organizers: readonly CourseAudienceOption[] | null;
	/** La portada vive en el orquestador: no participa del esquema del formulario. */
	cover: {
		value: File | null;
		existingUrl: string | null;
		removed: boolean;
		onChange: (file: File | null) => void;
		onRemove: () => void;
	};
}

export const CourseGeneralSection = memo(function CourseGeneralSection({
	ids,
	organizers,
	cover,
}: CourseGeneralSectionProps) {
	const {
		register,
		control,
		formState: { errors },
	} = useFormContext<CourseFormValues>();

	return (
		<Card>
			<CardContent>
				<FieldSet>
					<FieldLegend>Datos generales</FieldLegend>

					{organizers && (
						<CourseSelectField
							id={ids.dependency}
							name="dependency"
							label="Dependencia organizadora"
							required
							placeholder="Elige la dependencia"
							options={organizers.map((entry) => ({
								value: entry.documentId,
								label: entry.name,
							}))}
						/>
					)}

					<TextInput
						id={ids.title}
						label="Título"
						required
						placeholder="Ofimática básica"
						error={errors.title?.message}
						{...register("title")}
					/>

					<TextareaInput
						id={ids.description}
						label="Descripción"
						rows={3}
						error={errors.description?.message}
						{...register("description")}
					/>

					<CourseCoverField
						id={ids.cover}
						value={cover.value}
						existingUrl={cover.existingUrl}
						removed={cover.removed}
						onChange={cover.onChange}
						onRemove={cover.onRemove}
					/>

					<div className="grid gap-4 sm:grid-cols-2">
						<CourseSelectField
							id={ids.modality}
							name="modality"
							label="Modalidad"
							required
							options={MODALITY_OPTIONS}
						/>
						<CourseSelectField
							id={ids.access}
							name="access"
							label="Acceso"
							required
							options={ACCESS_OPTIONS}
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-3">
						<TextInput
							id={ids.capacity}
							label="Cupo"
							type="number"
							min={1}
							helperText="Vacío = sin límite"
							error={errors.capacity?.message}
							{...register("capacity")}
						/>
						<TextInput
							id={ids.enrollmentDeadline}
							label="Fecha límite de inscripción"
							type="date"
							helperText="Vacío = al iniciar la primera sesión"
							error={errors.enrollmentDeadline?.message}
							{...register("enrollmentDeadline")}
						/>
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
							label="QR: abre antes (min)"
							type="number"
							min={0}
							max={240}
							helperText="Antes del inicio de cada sesión"
							error={errors.qrOpensBeforeMinutes?.message}
							{...register("qrOpensBeforeMinutes")}
						/>
						<TextInput
							id={ids.qrClosesAfterMinutes}
							label="QR: cierra después (min)"
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
							<div className="flex items-center gap-2">
								<Checkbox
									id={ids.requiresEvaluation}
									checked={field.value}
									onCheckedChange={(checked) =>
										field.onChange(checked === true)
									}
									onBlur={field.onBlur}
								/>
								<Label htmlFor={ids.requiresEvaluation} className="font-normal">
									Requiere evaluación (aprobado / no aprobado)
								</Label>
							</div>
						)}
					/>
				</FieldSet>
			</CardContent>
		</Card>
	);
});
