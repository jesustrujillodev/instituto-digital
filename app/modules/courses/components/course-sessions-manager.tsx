import { CalendarPlus, CalendarRange } from "lucide-react";
import { useCallback } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { COURSE_MAX_SESSIONS } from "../domain/course.config";
import {
	COURSE_MODALITIES,
	type CourseModality,
	requiresLink,
	requiresVenue,
} from "../domain/course.rules";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import {
	type CourseFormValues,
	nextSessionValues,
} from "../utils/build-course-form-defaults";
import { MODALITY_LABELS } from "../utils/course-labels";
import { CourseFormSection } from "./course-form-section";
import { CourseSelectField } from "./course-select-field";
import { CourseSessionRow } from "./course-session-row";

const MODALITY_OPTIONS = COURSE_MODALITIES.map((value) => ({
	value,
	label: MODALITY_LABELS[value],
}));

const placeOf = (modality: CourseModality) =>
	requiresVenue(modality) && requiresLink(modality)
		? "sede y enlace"
		: requiresVenue(modality)
			? "sede"
			: "enlace";

interface CourseProgramFieldsProps {
	ids: CourseFormIds;
	/** Publicado: un cambio de horario o lugar se avisa por correo. */
	isPublished: boolean;
}

/**
 * El programa: modalidad y sesiones van juntas porque la modalidad decide qué
 * lugar pide cada sesión.
 */
export function CourseProgramFields({
	ids,
	isPublished,
}: CourseProgramFieldsProps) {
	const { getValues } = useFormContext<CourseFormValues>();
	const { fields, append, remove } = useFieldArray<
		CourseFormValues,
		"sessions"
	>({ name: "sessions" });
	const modality = useWatch<CourseFormValues, "modality">({ name: "modality" });

	const addSession = useCallback(() => {
		const sessions = getValues("sessions");
		append(nextSessionValues(sessions.at(-1)), {
			focusName: `sessions.${sessions.length}.date`,
		});
	}, [append, getValues]);

	const canAdd = fields.length < COURSE_MAX_SESSIONS;

	return (
		<>
			<div className="sm:max-w-xs">
				<CourseSelectField
					id={ids.modality}
					name="modality"
					label="Modalidad"
					required
					options={MODALITY_OPTIONS}
				/>
			</div>

			{isPublished && (
				<p className="text-muted-foreground text-sm">
					Si cambias horario o lugar, se avisa por correo a inscritos e
					invitados.
				</p>
			)}

			<div id={ids.sessions} className="flex flex-col gap-5">
				{fields.length === 0 ? (
					<Empty className="border border-border border-dashed p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<CalendarRange aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>Sin sesiones todavía</EmptyTitle>
							<EmptyDescription>
								Una sesión es una fecha con su horario y su {placeOf(modality)}.
								Puedes guardar el borrador así y programarlas más adelante.
							</EmptyDescription>
						</EmptyHeader>
						<Button type="button" variant="outline" onClick={addSession}>
							<CalendarPlus aria-hidden="true" />
							Agregar la primera sesión
						</Button>
					</Empty>
				) : (
					<>
						<ol className="flex flex-col gap-5">
							{fields.map((field, index) => (
								<CourseSessionRow
									key={field.id}
									index={index}
									modality={modality}
									onRemove={remove}
								/>
							))}
						</ol>

						<div className="flex flex-wrap items-center gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={addSession}
								disabled={!canAdd}
							>
								<CalendarPlus aria-hidden="true" />
								Agregar sesión
							</Button>
							<span className="text-muted-foreground text-xs">
								{canAdd
									? "La nueva repite el horario y el lugar de la última."
									: `Máximo ${COURSE_MAX_SESSIONS} sesiones.`}
							</span>
						</div>
					</>
				)}
			</div>
		</>
	);
}

export function CourseSessionsManager(props: CourseProgramFieldsProps) {
	const modality = useWatch<CourseFormValues, "modality">({ name: "modality" });

	return (
		<CourseFormSection
			section="program"
			description={`Horario de Tijuana. Para publicar hace falta al menos una sesión, y cada una con ${placeOf(modality)}.`}
		>
			<CourseProgramFields {...props} />
		</CourseFormSection>
	);
}
