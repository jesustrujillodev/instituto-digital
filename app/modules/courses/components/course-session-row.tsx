import { CircleAlert, Link2, MapPin, Trash2 } from "lucide-react";
import { memo, useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import { TextInput } from "@/shared/components/common/text-input";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { CourseModality } from "../domain/course.rules";
import { requiresLink, requiresVenue } from "../domain/course.rules";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { formatDuration, sessionMinutes } from "../utils/session-duration";

/**
 * Columnas de la lista de sesiones en escritorio. El encabezado y cada fila las
 * comparten para que todo quede alineado sin ser una `<table>`: una fila se
 * edita, y en móvil se apila como tarjeta.
 */
export const SESSION_GRID =
	"sm:grid-cols-[1.75rem_minmax(0,1fr)_7.5rem_7.5rem_7.5rem_2.25rem]";

interface CourseSessionRowProps {
	index: number;
	modality: CourseModality;
	/** Con la casilla "cada sesión en una sede distinta": el lugar va en la fila. */
	placePerSession: boolean;
	onRemove: (index: number) => void;
}

function SessionStatus({
	startTime,
	endTime,
}: {
	startTime: string;
	endTime: string;
}) {
	const minutes = sessionMinutes(startTime, endTime);

	if (minutes !== null) {
		return (
			<span className="text-muted-foreground text-sm tabular-nums">
				{formatDuration(minutes)}
			</span>
		);
	}

	const incomplete = startTime === "" || endTime === "";

	return (
		<span
			className={cn(
				"flex items-center gap-1.5 text-sm",
				incomplete ? "text-warning-foreground" : "text-destructive",
			)}
		>
			<CircleAlert className="size-4 shrink-0" aria-hidden="true" />
			{incomplete ? "Falta horario" : "Fin antes del inicio"}
		</span>
	);
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
	placePerSession,
	onRemove,
}: CourseSessionRowProps) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const [startTime, endTime] = useWatch<
		CourseFormValues,
		[`sessions.${number}.startTime`, `sessions.${number}.endTime`]
	>({
		name: [`sessions.${index}.startTime`, `sessions.${index}.endTime`],
	});
	const prefix = useId();
	const rowErrors = errors.sessions?.[index];
	const number = index + 1;
	const showVenue = placePerSession && requiresVenue(modality);
	const showLink = placePerSession && requiresLink(modality);

	const messages = [
		rowErrors?.date?.message,
		rowErrors?.startTime?.message,
		rowErrors?.endTime?.message,
		showVenue ? rowErrors?.venue?.message : undefined,
		showLink ? rowErrors?.link?.message : undefined,
	].filter((message): message is string => Boolean(message));

	const onSession = <span className="sr-only"> de la sesión {number}</span>;
	const cellLabel = "text-muted-foreground text-xs sm:sr-only";

	return (
		<li
			aria-label={`Sesión ${number}`}
			className={cn(
				"grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3",
				SESSION_GRID,
			)}
		>
			{/* Conserva la identidad de una sesión existente al editar. */}
			<input type="hidden" {...register(`sessions.${index}.documentId`)} />

			<span
				aria-hidden="true"
				className="flex size-7 items-center justify-center rounded-full bg-muted font-medium text-xs tabular-nums"
			>
				{number}
			</span>

			<div className="order-last col-span-3 flex flex-col gap-1.5 sm:order-none sm:col-span-1">
				<Label htmlFor={`${prefix}date`} className={cellLabel}>
					Fecha{onSession}
				</Label>
				<Input
					id={`${prefix}date`}
					type="date"
					required
					aria-invalid={Boolean(rowErrors?.date)}
					{...register(`sessions.${index}.date`)}
				/>
			</div>

			<div className="order-last col-span-3 grid grid-cols-2 gap-3 sm:contents">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${prefix}start`} className={cellLabel}>
						Inicio{onSession}
					</Label>
					<Input
						id={`${prefix}start`}
						type="time"
						required
						aria-invalid={Boolean(rowErrors?.startTime)}
						className={cn(
							startTime === "" &&
								"border-warning-foreground/40 aria-invalid:border-destructive",
						)}
						{...register(`sessions.${index}.startTime`)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${prefix}end`} className={cellLabel}>
						Fin{onSession}
					</Label>
					<Input
						id={`${prefix}end`}
						type="time"
						required
						aria-invalid={Boolean(rowErrors?.endTime)}
						className={cn(
							endTime === "" &&
								"border-warning-foreground/40 aria-invalid:border-destructive",
						)}
						{...register(`sessions.${index}.endTime`)}
					/>
				</div>
			</div>

			<SessionStatus startTime={startTime ?? ""} endTime={endTime ?? ""} />

			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={`Quitar la sesión ${number}`}
				onClick={() => onRemove(index)}
				className="justify-self-end text-muted-foreground hover:text-destructive"
			>
				<Trash2 aria-hidden="true" />
			</Button>

			{(showVenue || showLink) && (
				<div
					className={cn(
						"order-last col-span-3 grid gap-3 sm:order-none sm:col-span-4 sm:col-start-2",
						showVenue && showLink && "sm:grid-cols-2",
					)}
				>
					{showVenue && (
						<TextInput
							aria-label={`Sede de la sesión ${number}`}
							placeholder="Sede de esta sesión"
							icon={<MapPin className="size-4" aria-hidden="true" />}
							aria-invalid={Boolean(rowErrors?.venue)}
							{...register(`sessions.${index}.venue`)}
						/>
					)}
					{showLink && (
						<TextInput
							aria-label={`Enlace de la sesión ${number}`}
							type="url"
							placeholder="Enlace de esta sesión (https://…)"
							icon={<Link2 className="size-4" aria-hidden="true" />}
							aria-invalid={Boolean(rowErrors?.link)}
							{...register(`sessions.${index}.link`)}
						/>
					)}
				</div>
			)}

			{messages.length > 0 && (
				<ul className="order-last col-span-3 flex flex-col gap-0.5 sm:col-span-4 sm:col-start-2">
					{messages.map((message) => (
						<li key={message} role="alert" className="text-destructive text-sm">
							{message}
						</li>
					))}
				</ul>
			)}
		</li>
	);
});
