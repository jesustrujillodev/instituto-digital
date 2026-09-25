import {
	CalendarPlus,
	CalendarRange,
	Clock,
	Link2,
	MapPin,
	Plus,
} from "lucide-react";
import { useCallback, useId, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import { TextInput } from "@/shared/components/common/text-input";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { Label } from "@/shared/components/ui/label";
import { COURSE_MAX_SESSIONS } from "../domain/course.config";
import {
	type CourseModality,
	requiresLink,
	requiresVenue,
} from "../domain/course.rules";
import {
	type CourseFormValues,
	type CourseSessionFormValues,
	nextSessionValues,
} from "../utils/build-course-form-defaults";
import { formatDuration, sessionMinutes } from "../utils/session-duration";
import { CourseSessionRow, SESSION_GRID } from "./course-session-row";

const PLACE_OF: Record<CourseModality, string> = {
	IN_PERSON: "sede",
	ONLINE: "enlace",
	HYBRID: "sede y enlace",
};

const PER_SESSION_LABEL: Record<CourseModality, string> = {
	IN_PERSON: "Cada sesión en una sede distinta",
	ONLINE: "Cada sesión con un enlace distinto",
	HYBRID: "Cada sesión con su propia sede y enlace",
};

type PlaceKey = "venue" | "link";

const allShare = (sessions: readonly CourseSessionFormValues[]) =>
	sessions.every(
		(session) =>
			session.venue === sessions[0].venue && session.link === sessions[0].link,
	);

const sessionCount = (count: number) =>
	count === 1 ? "1 sesión" : `${count} sesiones`;

interface CourseSessionsFieldProps {
	id: string;
	modality: CourseModality;
	/** Publicado: un cambio de horario o lugar se avisa por correo. */
	isPublished: boolean;
}

/**
 * Las sesiones de un curso calendarizado.
 *
 * Casi todos los cursos se imparten siempre en la misma sala o con el mismo
 * enlace, así que el lugar se captura una vez y se copia a cada sesión. Solo si
 * cambia de una a otra se abre por fila. El servidor no distingue los dos
 * modos: siempre recibe el lugar sesión por sesión.
 */
export function CourseSessionsField({
	id,
	modality,
	isPublished,
}: CourseSessionsFieldProps) {
	const { control, getValues, setValue, trigger, formState } =
		useFormContext<CourseFormValues>();
	const { fields, append, remove } = useFieldArray<
		CourseFormValues,
		"sessions"
	>({
		name: "sessions",
	});
	const sessions = useWatch({ control, name: "sessions" });
	const prefix = useId();
	const [placePerSession, setPlacePerSession] = useState(
		() => !allShare(getValues("sessions")),
	);

	const showVenue = requiresVenue(modality);
	const showLink = requiresLink(modality);
	const canAdd = fields.length < COURSE_MAX_SESSIONS;

	const addSession = useCallback(() => {
		const current = getValues("sessions");
		append(nextSessionValues(current.at(-1)), {
			focusName: `sessions.${current.length}.date`,
		});
	}, [append, getValues]);

	const setPlaceOfAll = (key: PlaceKey, value: string) => {
		getValues("sessions").forEach((_, index) => {
			setValue(`sessions.${index}.${key}`, value, { shouldDirty: true });
		});
	};

	const validatePlaceOfAll = (key: PlaceKey) =>
		trigger(
			getValues("sessions").map(
				(_, index) => `sessions.${index}.${key}` as const,
			),
		);

	// Volver a un solo lugar lo unifica con el de la primera sesión: es el que
	// el campo compartido enseña.
	const togglePlacePerSession = (checked: boolean) => {
		setPlacePerSession(checked);
		if (checked) return;

		const [first] = getValues("sessions");
		if (!first) return;
		setPlaceOfAll("venue", first.venue);
		setPlaceOfAll("link", first.link);
	};

	const sharedError = (key: PlaceKey) =>
		formState.errors.sessions?.find?.((entry) => entry?.[key])?.[key]?.message;

	const totalMinutes = sessions.reduce(
		(sum, session) =>
			sum + (sessionMinutes(session.startTime, session.endTime) ?? 0),
		0,
	);

	const shared = !placePerSession || fields.length < 2;

	return (
		<fieldset id={id} className="flex min-w-0 flex-col gap-4">
			<legend className="mb-1 flex w-full items-center justify-between gap-3">
				<span className="font-medium text-sm">Sesiones</span>
				<span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs">
					<Clock className="size-3.5" aria-hidden="true" />
					Horario de Tijuana
				</span>
			</legend>
			<p className="text-muted-foreground text-sm">
				Para publicar hace falta al menos una, con fecha, horario y{" "}
				{PLACE_OF[modality]}.
				{isPublished &&
					" Si cambias horario o lugar, se avisa por correo a inscritos e invitados."}
			</p>

			{fields.length === 0 ? (
				<Empty className="border border-border border-dashed p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CalendarRange aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>Sin sesiones todavía</EmptyTitle>
						<EmptyDescription>
							Una sesión es una fecha con su horario y su {PLACE_OF[modality]}.
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
					{shared && (
						<div
							className={cn(
								"grid gap-4",
								showVenue && showLink && "sm:grid-cols-2",
							)}
						>
							{showVenue && (
								<TextInput
									id={`${prefix}venue`}
									label={
										fields.length === 1 ? "Sede" : "Sede de todas las sesiones"
									}
									placeholder="Sala de capacitación, edificio B"
									icon={<MapPin className="size-4" aria-hidden="true" />}
									value={sessions[0]?.venue ?? ""}
									error={sharedError("venue")}
									onChange={(event) =>
										setPlaceOfAll("venue", event.target.value)
									}
									onBlur={() => validatePlaceOfAll("venue")}
								/>
							)}
							{showLink && (
								<TextInput
									id={`${prefix}link`}
									type="url"
									label={
										fields.length === 1
											? "Enlace"
											: "Enlace de todas las sesiones"
									}
									placeholder="https://"
									icon={<Link2 className="size-4" aria-hidden="true" />}
									value={sessions[0]?.link ?? ""}
									error={sharedError("link")}
									onChange={(event) =>
										setPlaceOfAll("link", event.target.value)
									}
									onBlur={() => validatePlaceOfAll("link")}
								/>
							)}
						</div>
					)}

					{fields.length > 1 && (
						<div className="flex items-center gap-2">
							<Checkbox
								id={`${prefix}per-session`}
								checked={placePerSession}
								onCheckedChange={(checked) =>
									togglePlacePerSession(checked === true)
								}
							/>
							<Label
								htmlFor={`${prefix}per-session`}
								className="font-normal text-sm"
							>
								{PER_SESSION_LABEL[modality]}
							</Label>
						</div>
					)}

					<div className="overflow-hidden rounded-xl border border-border bg-card">
						<div
							aria-hidden="true"
							className={cn(
								"hidden gap-3 border-border border-b px-4 py-2.5 text-muted-foreground text-xs sm:grid",
								SESSION_GRID,
							)}
						>
							<span>#</span>
							<span>Fecha</span>
							<span>Inicio</span>
							<span>Fin</span>
							<span>Duración</span>
						</div>
						<ol className="divide-y divide-border">
							{fields.map((field, index) => (
								<CourseSessionRow
									key={field.id}
									index={index}
									modality={modality}
									placePerSession={!shared}
									onRemove={remove}
								/>
							))}
						</ol>
					</div>

					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						<Button
							type="button"
							variant="outline"
							onClick={addSession}
							disabled={!canAdd}
						>
							<Plus aria-hidden="true" />
							Agregar sesión
						</Button>
						<span className="text-muted-foreground text-xs">
							{canAdd
								? "Se agrega al día siguiente con el mismo horario."
								: `Máximo ${COURSE_MAX_SESSIONS} sesiones.`}
						</span>
						<span className="ml-auto text-muted-foreground text-xs tabular-nums">
							{sessionCount(fields.length)}
							{totalMinutes > 0 &&
								` · ${formatDuration(totalMinutes)} programadas`}
						</span>
					</div>
				</>
			)}
		</fieldset>
	);
}
