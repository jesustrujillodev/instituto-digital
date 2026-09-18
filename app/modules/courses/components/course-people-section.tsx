import { memo, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import { COURSE_ACCESS_TYPES } from "../domain/course.rules";
import type { CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { ACCESS_LABELS } from "../utils/course-labels";
import { CourseChecklistField } from "./course-checklist-field";
import { CourseFormSection } from "./course-form-section";
import { CourseSelectField } from "./course-select-field";

const ACCESS_OPTIONS = COURSE_ACCESS_TYPES.map((value) => ({
	value,
	label: ACCESS_LABELS[value],
}));

interface CoursePeopleSectionProps {
	ids: CourseFormIds;
	options: CourseFormOptions;
}

/**
 * Quién imparte, quién puede inscribirse y en qué condiciones.
 *
 * `useWatch` vive aquí y no en el orquestador: cambiar el acceso solo tiene que
 * volver a pintar esta sección, no el formulario entero.
 */
export const CoursePeopleSection = memo(function CoursePeopleSection({
	ids,
	options,
}: CoursePeopleSectionProps) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const access = useWatch<CourseFormValues, "access">({ name: "access" });

	const trainerOptions = useMemo(
		() =>
			options.trainers.map((trainer) => ({
				value: trainer.documentId,
				label:
					[trainer.firstName, trainer.lastName].filter(Boolean).join(" ") ||
					trainer.email,
				description: trainer.specialty,
			})),
		[options.trainers],
	);

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
		<CourseFormSection
			section="people"
			description="Quién imparte, quién puede verlo y cuántos lugares hay."
		>
			<CourseChecklistField
				id={ids.trainers}
				name="trainers"
				legend="Capacitadores"
				options={trainerOptions}
				emptyText="No hay capacitadores activos en el catálogo."
			/>

			<div className="flex flex-col gap-3">
				<div className="sm:max-w-xs">
					<CourseSelectField
						id={ids.access}
						name="access"
						label="Acceso"
						required
						options={ACCESS_OPTIONS}
					/>
				</div>

				{access === "RESTRICTED" ? (
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
				) : (
					<p className="text-muted-foreground text-sm">
						{access === "PUBLIC"
							? "Cualquier persona interna podrá verlo una vez publicado."
							: "Solo lo verán las personas invitadas. Las invitaciones se envían después de publicarlo."}
					</p>
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
		</CourseFormSection>
	);
});
