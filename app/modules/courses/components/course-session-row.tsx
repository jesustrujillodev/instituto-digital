import { Trash2 } from "lucide-react";
import { memo } from "react";
import { useFormContext } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { Button } from "@/shared/components/ui/button";
import type { CourseModality } from "../domain/course.rules";
import { requiresLink, requiresVenue } from "../domain/course.rules";
import type { CourseFormValues } from "../utils/build-course-form-defaults";

interface CourseSessionRowProps {
	index: number;
	modality: CourseModality;
	onRemove: (index: number) => void;
}

/**
 * Una sesión. Cada fila se registra por su cuenta con `useFormContext`, así que
 * teclear en la quinta no vuelve a pintar la primera.
 *
 * Solo pinta el lugar que la modalidad usa. Si se cambia de modalidad, el valor
 * del campo oculto se conserva y vuelve a aparecer al regresar.
 */
export const CourseSessionRow = memo(function CourseSessionRow({
	index,
	modality,
	onRemove,
}: CourseSessionRowProps) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const rowErrors = errors.sessions?.[index];
	const number = index + 1;
	const showVenue = requiresVenue(modality);
	const showLink = requiresLink(modality);

	return (
		<li
			aria-label={`Sesión ${number}`}
			className="flex flex-col gap-3 border-border border-t pt-5 first:border-t-0 first:pt-0"
		>
			<div className="flex items-center justify-between">
				<span className="font-medium text-sm">Sesión {number}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Quitar la sesión ${number}`}
					onClick={() => onRemove(index)}
				>
					<Trash2 aria-hidden="true" />
				</Button>
			</div>

			{/* Conserva la identidad de una sesión existente al editar. */}
			<input type="hidden" {...register(`sessions.${index}.documentId`)} />

			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
				<TextInput
					label="Fecha"
					type="date"
					required
					error={rowErrors?.date?.message}
					{...register(`sessions.${index}.date`)}
				/>
				<TextInput
					label="Inicio"
					type="time"
					required
					error={rowErrors?.startTime?.message}
					{...register(`sessions.${index}.startTime`)}
				/>
				<TextInput
					label="Fin"
					type="time"
					required
					error={rowErrors?.endTime?.message}
					{...register(`sessions.${index}.endTime`)}
				/>
			</div>

			<div
				className={
					showVenue && showLink ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"
				}
			>
				{showVenue && (
					<TextInput
						label="Sede"
						placeholder="Sala de capacitación, edificio B"
						error={rowErrors?.venue?.message}
						{...register(`sessions.${index}.venue`)}
					/>
				)}
				{showLink && (
					<TextInput
						label="Enlace"
						type="url"
						placeholder="https://"
						error={rowErrors?.link?.message}
						{...register(`sessions.${index}.link`)}
					/>
				)}
			</div>
		</li>
	);
});
