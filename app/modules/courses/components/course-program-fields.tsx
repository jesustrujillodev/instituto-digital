import { BookOpenText, Info, Video } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { MODALITY_LABELS } from "../domain/course.labels";
import {
	allowsSessions,
	COURSE_MODALITIES,
	type CourseFormat,
	type CourseModality,
	countsAttendance,
	requiresSessions,
	requiresTrainer,
} from "../domain/course.rules";
import type { CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { CourseChecklistField } from "./course-checklist-field";
import { CourseChoiceField } from "./course-choice-field";
import { CourseQrWindowFields } from "./course-qr-window-fields";
import { CourseSessionsField } from "./course-sessions-field";

const MODALITY_DESCRIPTIONS: Record<CourseModality, string> = {
	IN_PERSON: "Sesiones en una sede",
	ONLINE: "Por videollamada o a su ritmo",
	HYBRID: "En línea, con sesiones presenciales",
};

const MODALITY_OPTIONS = COURSE_MODALITIES.map((value) => ({
	value,
	label: MODALITY_LABELS[value],
	description: MODALITY_DESCRIPTIONS[value],
}));

// A su ritmo primero: es la que suma el paso Contenido al alta.
const DELIVERY_OPTIONS = [
	{
		value: "SELF_PACED",
		label: "Contenido a su ritmo",
		description:
			"Lecciones que cada quien recorre cuando quiera. Se arman en el paso Contenido.",
		icon: BookOpenText,
	},
	{
		value: "SCHEDULED",
		label: "Sesiones en vivo",
		description: "Por videollamada, en fechas y horarios fijos.",
		icon: Video,
	},
] satisfies { value: CourseFormat; [key: string]: unknown }[];

interface CourseProgramFieldsProps {
	ids: CourseFormIds;
	options: CourseFormOptions;
	/** Publicado: un cambio de horario o lugar se avisa por correo. */
	isPublished: boolean;
	/** `null` antes del primer guardado. */
	courseDocumentId: string | null;
}

/**
 * El programa: la modalidad decide todo lo demás. Presencial se reúne siempre;
 * en línea y la híbrida preguntan cómo se imparte la parte en línea, y esa
 * respuesta es el formato. Quién imparte y las sesiones van después, solo
 * cuando el curso los admite.
 */
export function CourseProgramFields({
	ids,
	options,
	isPublished,
	courseDocumentId,
}: CourseProgramFieldsProps) {
	const { setValue } = useFormContext<CourseFormValues>();
	const modality = useWatch<CourseFormValues, "modality">({ name: "modality" });
	const format = useWatch<CourseFormValues, "format">({ name: "format" });
	const completionRule = useWatch<CourseFormValues, "completionRule">({
		name: "completionRule",
	});

	/**
	 * El formato arrastra la regla de completado y el método de evaluación: un
	 * autogestivo no cuenta asistencia y solo se evalúa con examen. Se corrige al
	 * elegir y no en el paso Evaluación porque el wizard guarda cada paso por
	 * separado y el servidor rechazaría el guardado intermedio.
	 */
	const applyFormat = useCallback(
		(value: CourseFormat) => {
			setValue("format", value, { shouldDirty: true });
			if (requiresSessions(value)) return;
			setValue("completionRule", "CONTENT");
		},
		[setValue],
	);

	// Presencial siempre se reúne: no hay parte en línea que preguntar.
	const applyModality = useCallback(
		(value: string) => {
			if (value === "IN_PERSON") applyFormat("SCHEDULED");
		},
		[applyFormat],
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

	const shape = { format, modality };
	const selfPaced = !requiresSessions(format);
	// Publicado, un autogestivo ya no puede ganar ni perder sesiones: pasar de
	// híbrido a en línea borraría las que tenga y su asistencia.
	const modalityLocked = isPublished && selfPaced;

	return (
		<>
			<CourseChoiceField
				id={ids.modality}
				name="modality"
				legend="Modalidad"
				required
				options={MODALITY_OPTIONS}
				onChanged={applyModality}
				disabled={modalityLocked}
				helperText={
					isPublished
						? "Cómo se imparte la capacitación no cambia una vez publicada."
						: undefined
				}
				detail={
					modality !== "IN_PERSON" && (
						<div className="flex flex-col gap-3">
							<CourseChoiceField
								id={ids.format}
								name="format"
								legend={
									modality === "HYBRID"
										? "¿Cómo se imparte la parte en línea?"
										: "¿Cómo se imparte en línea?"
								}
								required
								options={DELIVERY_OPTIONS}
								onChanged={(value) => applyFormat(value as CourseFormat)}
								disabled={isPublished}
							/>
							{selfPaced && !isPublished && (
								<p className="flex items-start gap-2 text-muted-foreground text-sm">
									<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
									{modality === "HYBRID"
										? "Agregamos el paso Contenido al alta para que armes las lecciones.Las sesiones de abajo son opcionales y no cuentan para acreditarla."
										: "Agregamos el paso Contenido al alta para que armes las lecciones. Sin sesiones ni capacitador: cada quien obtiene su crédito al terminarlas."}
								</p>
							)}
						</div>
					)
				}
			/>

			{requiresTrainer(shape) && (
				<CourseChecklistField
					id={ids.trainers}
					name="trainers"
					legend="Capacitadores"
					options={trainerOptions}
					emptyText="No hay capacitadores activos en el catálogo."
					searchPlaceholder="Buscar por nombre o área"
					withInitials
				/>
			)}

			{allowsSessions(shape) && (
				<CourseSessionsField
					id={ids.sessions}
					modality={modality}
					optional={selfPaced}
					isPublished={isPublished}
					courseDocumentId={courseDocumentId}
				/>
			)}

			{/* Solo donde la asistencia cuenta para completar: ahí el QR es la forma
			    de tomarla. */}
			{allowsSessions(shape) && countsAttendance(completionRule) && (
				<CourseQrWindowFields ids={ids} />
			)}
		</>
	);
}
