import { Info } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
	COURSE_MODALITIES,
	type CourseFormat,
	type CourseModality,
	requiresSessions,
} from "../domain/course.rules";
import type { CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { FORMAT_LABELS, MODALITY_LABELS } from "../utils/course-labels";
import { CourseChecklistField } from "./course-checklist-field";
import { CourseChoiceField } from "./course-choice-field";
import { CourseSessionsField } from "./course-sessions-field";

const FORMAT_DESCRIPTIONS: Record<CourseFormat, string> = {
	SELF_PACED: "A su ritmo, sin sesiones",
	SCHEDULED: "Con sesiones en fechas fijas",
};

const MODALITY_DESCRIPTIONS: Record<CourseModality, string> = {
	IN_PERSON: "Sesiones en una sede",
	ONLINE: "Sesiones por videollamada",
	HYBRID: "Sede y enlace en cada sesión",
};

// Autogestivo primero: es el que no pide nada más en este paso.
const FORMAT_OPTIONS = (["SELF_PACED", "SCHEDULED"] as const).map((value) => ({
	value,
	label: FORMAT_LABELS[value],
	description: FORMAT_DESCRIPTIONS[value],
}));

const MODALITY_OPTIONS = COURSE_MODALITIES.map((value) => ({
	value,
	label: MODALITY_LABELS[value],
	description: MODALITY_DESCRIPTIONS[value],
}));

interface CourseProgramFieldsProps {
	ids: CourseFormIds;
	options: CourseFormOptions;
	/** Publicado: un cambio de horario o lugar se avisa por correo. */
	isPublished: boolean;
}

/**
 * El programa: formato, modalidad y sesiones van juntos porque el formato
 * decide si hay sesiones y la modalidad qué lugar pide cada una. Quién imparte
 * va entre medias, y solo si hay sesiones: un autogestivo no tiene capacitador.
 */
export function CourseProgramFields({
	ids,
	options,
	isPublished,
}: CourseProgramFieldsProps) {
	const { setValue } = useFormContext<CourseFormValues>();
	const modality = useWatch<CourseFormValues, "modality">({ name: "modality" });
	const format = useWatch<CourseFormValues, "format">({ name: "format" });

	/**
	 * El formato arrastra la regla de completado y el método de evaluación: sin
	 * sesiones no hay asistencia que medir, y sin capacitador nadie captura
	 * resultados a mano. Se corrige al elegir y no en el paso Evaluación porque
	 * el wizard guarda cada paso por separado y el servidor rechazaría el
	 * guardado intermedio.
	 */
	const applyFormat = useCallback(
		(value: string) => {
			if (requiresSessions(value as CourseFormat)) return;
			setValue("completionRule", "CONTENT");
			setValue("evaluationMethod", "QUIZ");
		},
		[setValue],
	);

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

	const scheduled = requiresSessions(format);

	return (
		<>
			<div className="flex flex-col gap-3">
				<CourseChoiceField
					id={ids.format}
					name="format"
					legend="Formato"
					required
					options={FORMAT_OPTIONS}
					onChanged={applyFormat}
					disabled={isPublished}
					helperText={
						isPublished ? "El formato no cambia una vez publicado." : undefined
					}
				/>
				{!scheduled && (
					<p className="flex items-start gap-2 text-muted-foreground text-sm">
						<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						Sin sesiones que programar ni capacitador que asignar: cada persona
						recorre las lecciones a su ritmo y obtiene su crédito al
						terminarlas.
					</p>
				)}
			</div>

			{scheduled && (
				<>
					<CourseChoiceField
						id={ids.modality}
						name="modality"
						legend="Modalidad"
						required
						options={MODALITY_OPTIONS}
					/>

					<CourseChecklistField
						id={ids.trainers}
						name="trainers"
						legend="Capacitadores"
						options={trainerOptions}
						emptyText="No hay capacitadores activos en el catálogo."
						searchPlaceholder="Buscar por nombre o área"
						withInitials
					/>
				</>
			)}

			{scheduled && (
				<CourseSessionsField
					id={ids.sessions}
					modality={modality}
					isPublished={isPublished}
				/>
			)}
		</>
	);
}
