import { memo, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { COURSE_ACCESS_TYPES } from "../domain/course.rules";
import type { CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { ACCESS_LABELS } from "../utils/course-labels";
import { CourseChecklistField } from "./course-checklist-field";
import { CourseSelectField } from "./course-select-field";

const ACCESS_OPTIONS = COURSE_ACCESS_TYPES.map((value) => ({
	value,
	label: ACCESS_LABELS[value],
}));

interface CourseEnrollmentFieldsProps {
	ids: CourseFormIds;
	options: CourseFormOptions;
}

/**
 * Quién puede inscribirse y en qué condiciones.
 *
 * `useWatch` vive aquí y no en el orquestador: cambiar el acceso solo tiene que
 * volver a pintar estos campos, no el formulario entero.
 */
export const CourseEnrollmentFields = memo(function CourseEnrollmentFields({
	ids,
	options,
}: CourseEnrollmentFieldsProps) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const access = useWatch<CourseFormValues, "access">({ name: "access" });

	const dependencyOptions = useMemo(
		() =>
			options.audienceDependencies.map((entry) => ({
				value: entry.documentId,
				label: entry.name,
			})),
		[options.audienceDependencies],
	);

	const groupOptions = useMemo(
		() =>
			options.audienceGroups.map((entry) => ({
				value: entry.documentId,
				label: entry.name,
				description: entry.dependencyName,
			})),
		[options.audienceGroups],
	);

	return (
		<>
			<div className="flex flex-col gap-4">
				<CourseSelectField
					id={ids.access}
					name="access"
					label="Acceso"
					required
					options={ACCESS_OPTIONS}
					helperText={
						access === "PUBLIC"
							? "Cualquier persona interna podrá verlo una vez publicado."
							: access === "INVITATION"
								? "Solo lo verán las personas invitadas. Las invitaciones se envían después de publicarlo."
								: "Solo lo verán las dependencias y los grupos que elijas."
					}
				/>

				{access === "RESTRICTED" && (
					<div id={ids.audience} className="grid gap-4 md:grid-cols-2">
						<CourseChecklistField
							id={`${ids.audience}-dependencies`}
							name="audienceDependencies"
							legend="Dependencias completas"
							options={dependencyOptions}
							emptyText="No hay dependencias activas."
						/>
						<CourseChecklistField
							id={`${ids.audience}-groups`}
							name="audienceGroups"
							legend="Grupos (listas nominales)"
							options={groupOptions}
							emptyText="No hay grupos activos a tu alcance."
						/>
					</div>
				)}
			</div>

			<div className="grid items-start gap-4 sm:grid-cols-2">
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
			</div>
		</>
	);
});
