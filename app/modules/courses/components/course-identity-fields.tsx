import { memo } from "react";
import { useFormContext } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
import type { CourseAudienceOption } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
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
}

/** Identidad del curso: lo que el personal lee en el catálogo antes de inscribirse. */
export const CourseIdentityFields = memo(function CourseIdentityFields({
	ids,
	organizers,
	cover,
}: CourseIdentityFieldsProps) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();

	return (
		<>
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
				placeholder="Qué se aprende, a quién va dirigido y qué hay que llevar."
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
		</>
	);
});
