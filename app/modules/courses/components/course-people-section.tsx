import { memo, useMemo } from "react";
import { useWatch } from "react-hook-form";
import { Card, CardContent } from "@/shared/components/ui/card";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import type { CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { CourseChecklistField } from "./course-checklist-field";

interface CoursePeopleSectionProps {
	ids: CourseFormIds;
	options: CourseFormOptions;
}

/**
 * Quién imparte y a quién va dirigido.
 *
 * `useWatch` vive aquí y no en el orquestador: cambiar el acceso solo tiene que
 * volver a pintar esta sección, no el formulario entero.
 */
export const CoursePeopleSection = memo(function CoursePeopleSection({
	ids,
	options,
}: CoursePeopleSectionProps) {
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
		<Card>
			<CardContent>
				<FieldSet>
					<FieldLegend>Capacitadores y audiencia</FieldLegend>

					<CourseChecklistField
						id={ids.trainers}
						name="trainers"
						legend="Capacitadores"
						options={trainerOptions}
						emptyText="No hay capacitadores activos en el catálogo."
					/>

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
								? "Cualquier persona interna podrá ver el curso una vez publicado."
								: "Solo las personas invitadas verán el curso. Las invitaciones se envían después de publicarlo."}
						</p>
					)}
				</FieldSet>
			</CardContent>
		</Card>
	);
});
