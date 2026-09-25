import { memo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { COURSE_HOURS_LIMITS } from "../domain/course.config";
import { requiresSessions } from "../domain/course.rules";
import type { CourseAudienceOption } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { CourseCatalogPreview } from "./course-catalog-preview";
import { CourseCoverField } from "./course-cover-field";
import { CourseSelectField } from "./course-select-field";

/** La portada vive fuera del esquema del formulario (guía §10.4). */
export interface CourseCoverControl {
	value: File | null;
	existingUrl: string | null;
	removed: boolean;
	onChange: (file: File | null) => void;
	onRemove: () => void;
}

interface CourseIdentityFieldsProps {
	ids: CourseFormIds;
	/** `null` cuando la organizadora no se elige: se hereda del alcance. */
	organizers: readonly CourseAudienceOption[] | null;
	cover: CourseCoverControl;
	/** `null` en el primer paso del alta: el borrador todavía no existe. */
	documentId: string | null;
}

/** Lo general del curso: lo que el personal lee en el catálogo antes de inscribirse. */
export const CourseIdentityFields = memo(function CourseIdentityFields({
	ids,
	organizers,
	cover,
	documentId,
}: CourseIdentityFieldsProps) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const format = useWatch<CourseFormValues, "format">({ name: "format" });
	const scheduled = requiresSessions(format);

	return (
		<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<div className="flex min-w-0 flex-col gap-6">
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
					rows={5}
					placeholder="Ej. Aprende a usar el procesador de textos y la hoja de cálculo en tu trabajo diario. Para todo el personal administrativo. Trae tu equipo portátil."
					helperText="Cuenta qué se aprende, a quién va dirigido y qué hay que llevar."
					error={errors.description?.message}
					{...register("description")}
				/>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor={ids.hours}>Duración</Label>
					<div className="relative w-44">
						<Input
							id={ids.hours}
							type="number"
							inputMode="numeric"
							min={COURSE_HOURS_LIMITS.min}
							max={COURSE_HOURS_LIMITS.max}
							placeholder={scheduled ? "Automática" : "Opcional"}
							aria-invalid={Boolean(errors.hours)}
							aria-describedby={`${ids.hours}-hint`}
							className="pr-16 tabular-nums"
							{...register("hours")}
						/>
						<span
							aria-hidden="true"
							className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm"
						>
							horas
						</span>
					</div>
					{errors.hours ? (
						<span role="alert" className="text-destructive text-sm">
							{errors.hours.message}
						</span>
					) : (
						<span
							id={`${ids.hours}-hint`}
							className="text-muted-foreground text-xs"
						>
							{scheduled
								? "Las que acredita el certificado. Si la dejas vacía, se calcula con las sesiones."
								: "Las que acredita el certificado. Si la dejas vacía, el curso no muestra horas."}
						</span>
					)}
				</div>

				<CourseCoverField
					id={ids.cover}
					value={cover.value}
					existingUrl={cover.existingUrl}
					removed={cover.removed}
					onChange={cover.onChange}
					onRemove={cover.onRemove}
				/>
			</div>

			<aside className="lg:sticky lg:top-24">
				<CourseCatalogPreview documentId={documentId} cover={cover} />
			</aside>
		</div>
	);
});
