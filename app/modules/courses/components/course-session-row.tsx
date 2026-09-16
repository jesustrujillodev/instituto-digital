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

	return (
		<div className="flex flex-col gap-3 rounded-md border border-border p-4">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">Sesión #{index + 1}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={`Quitar la sesión ${index + 1}`}
					onClick={() => onRemove(index)}
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>

			{/* Conserva la identidad de una sesión existente al editar. */}
			<input type="hidden" {...register(`sessions.${index}.documentId`)} />

			<div className="grid gap-3 sm:grid-cols-3">
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

			<div className="grid gap-3 sm:grid-cols-2">
				<TextInput
					label="Sede"
					placeholder="Sala de capacitación, edificio B"
					helperText={
						requiresVenue(modality) ? "Obligatoria para publicar" : undefined
					}
					error={rowErrors?.venue?.message}
					{...register(`sessions.${index}.venue`)}
				/>
				<TextInput
					label="Enlace"
					type="url"
					placeholder="https://"
					helperText={
						requiresLink(modality) ? "Obligatorio para publicar" : undefined
					}
					error={rowErrors?.link?.message}
					{...register(`sessions.${index}.link`)}
				/>
			</div>
		</div>
	);
});
