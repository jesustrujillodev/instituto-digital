import { Eye } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import {
	memo,
	type ReactNode,
	type RefObject,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Input } from "@/shared/components/ui/input";
import {
	COURSE_ACCESS_TYPES,
	type CourseAccessType,
	requiresSessions,
} from "../domain/course.rules";
import type { CourseFormOptions } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { ACCESS_LABELS } from "../utils/course-labels";
import {
	enrollmentSummaryOf,
	firstSessionStartOf,
	formatStart,
} from "../utils/enrollment-summary";
import { CourseChecklistField } from "./course-checklist-field";
import { CourseChoiceField } from "./course-choice-field";

const ACCESS_DESCRIPTIONS: Record<CourseAccessType, string> = {
	PUBLIC: "Todo el personal interno lo ve en el catálogo.",
	RESTRICTED: "Solo las dependencias o grupos que elijas.",
	INVITATION: "Solo quien invites. No aparece en el catálogo.",
};

const ACCESS_OPTIONS = COURSE_ACCESS_TYPES.map((value) => ({
	value,
	label: ACCESS_LABELS[value],
	description: ACCESS_DESCRIPTIONS[value],
}));

/** Una opción de un grupo de dos, con lo que la acompañe en la misma línea. */
function OptionRow({
	value,
	label,
	description,
	children,
}: {
	value: string;
	label: string;
	description?: string;
	children?: ReactNode;
}) {
	const id = useId();

	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<RadioGroupPrimitive.Item
				id={id}
				value={value}
				className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=checked]:border-primary"
			>
				<RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-primary" />
			</RadioGroupPrimitive.Item>
			<label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium text-sm">{label}</span>
				{description && (
					<span className="text-muted-foreground text-xs">{description}</span>
				)}
			</label>
			{children}
		</div>
	);
}

function OptionGroup({
	legend,
	value,
	onValueChange,
	children,
	error,
}: {
	legend: string;
	value: string;
	onValueChange: (value: string) => void;
	children: ReactNode;
	error?: string;
}) {
	const legendId = useId();

	return (
		<div className="flex flex-col gap-2">
			<span id={legendId} className="font-medium text-sm">
				{legend}
			</span>
			<RadioGroupPrimitive.Root
				aria-labelledby={legendId}
				value={value}
				onValueChange={onValueChange}
				className="divide-y divide-border rounded-xl border border-border bg-card"
			>
				{children}
			</RadioGroupPrimitive.Root>
			{error && (
				<span role="alert" className="text-destructive text-sm">
					{error}
				</span>
			)}
		</div>
	);
}

interface CourseEnrollmentFieldsProps {
	ids: CourseFormIds;
	options: CourseFormOptions;
	isPublished: boolean;
}

/**
 * Quién puede inscribirse y en qué condiciones.
 *
 * Cupo y fecha límite siguen siendo dos campos que vacíos significan algo
 * ("sin límite", "hasta que empiece"); aquí se eligen como opción explícita
 * para que ese vacío no sea un misterio.
 */
export const CourseEnrollmentFields = memo(function CourseEnrollmentFields({
	ids,
	options,
	isPublished,
}: CourseEnrollmentFieldsProps) {
	const {
		register,
		setValue,
		getValues,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const [
		access,
		capacity,
		deadline,
		format,
		sessions,
		audienceDependencies,
		audienceGroups,
	] = useWatch<
		CourseFormValues,
		[
			"access",
			"capacity",
			"enrollmentDeadline",
			"format",
			"sessions",
			"audienceDependencies",
			"audienceGroups",
		]
	>({
		name: [
			"access",
			"capacity",
			"enrollmentDeadline",
			"format",
			"sessions",
			"audienceDependencies",
			"audienceGroups",
		],
	});

	const scheduled = requiresSessions(format);
	const firstSessionStart = firstSessionStartOf(sessions ?? []);

	// Qué opción está elegida no se deduce solo del valor: elegir "Hasta" con el
	// campo todavía vacío tiene que quedarse en "Hasta".
	const [limited, setLimited] = useState(() => getValues("capacity") !== "");
	const [byDate, setByDate] = useState(
		() => getValues("enrollmentDeadline") !== "",
	);
	const lastCapacity = useRef(getValues("capacity"));
	const lastDeadline = useRef(getValues("enrollmentDeadline"));
	const capacityRef = useRef<HTMLInputElement | null>(null);
	const deadlineRef = useRef<HTMLInputElement | null>(null);

	const choose = (
		field: "capacity" | "enrollmentDeadline",
		on: boolean,
		remember: RefObject<string>,
		input: RefObject<HTMLInputElement | null>,
	) => {
		const current = getValues(field);
		if (current !== "") remember.current = current;
		setValue(field, on ? remember.current : "", {
			shouldDirty: true,
			shouldValidate: true,
		});
		if (on) requestAnimationFrame(() => input.current?.focus());
	};

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

	const capacityField = register("capacity");
	const deadlineField = register("enrollmentDeadline");

	const summary = enrollmentSummaryOf({
		access,
		dependencyCount: audienceDependencies?.length ?? 0,
		groupCount: audienceGroups?.length ?? 0,
		capacity: limited ? capacity : "",
		deadline: byDate ? deadline : "",
		firstSessionStart,
		scheduled,
	});

	return (
		<>
			<div className="flex flex-col gap-4">
				<CourseChoiceField
					id={ids.access}
					name="access"
					legend="Quién puede inscribirse"
					required
					options={ACCESS_OPTIONS}
					helperText={
						access === "INVITATION"
							? "Las invitaciones se envían después de publicarlo."
							: undefined
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

			<div className="grid items-start gap-6 md:grid-cols-2">
				<OptionGroup
					legend="Lugares"
					value={limited ? "limited" : "unlimited"}
					onValueChange={(value) => {
						const on = value === "limited";
						setLimited(on);
						choose("capacity", on, lastCapacity, capacityRef);
					}}
					error={
						errors.capacity?.message ??
						(limited && capacity.trim() === ""
							? "Escribe cuántos lugares hay. Vacío cuenta como sin límite."
							: undefined)
					}
				>
					<OptionRow value="unlimited" label="Sin límite" />
					<OptionRow value="limited" label="Hasta">
						<Input
							id={ids.capacity}
							type="number"
							inputMode="numeric"
							min={1}
							aria-label="Número de lugares"
							disabled={!limited}
							aria-invalid={Boolean(errors.capacity)}
							className="h-8 w-20 text-center tabular-nums"
							{...capacityField}
							ref={(element) => {
								capacityField.ref(element);
								capacityRef.current = element;
							}}
						/>
						<span
							className={cn("text-sm", !limited && "text-muted-foreground")}
						>
							lugares
						</span>
					</OptionRow>
				</OptionGroup>

				<OptionGroup
					legend="Inscripciones abiertas"
					value={byDate ? "date" : "open"}
					onValueChange={(value) => {
						const on = value === "date";
						setByDate(on);
						choose("enrollmentDeadline", on, lastDeadline, deadlineRef);
					}}
					error={
						errors.enrollmentDeadline?.message ??
						(byDate && deadline === ""
							? "Elige la fecha. Vacía cuenta como la otra opción."
							: undefined)
					}
				>
					<OptionRow
						value="open"
						label={
							scheduled
								? "Hasta que empiece la primera sesión"
								: "Sin fecha límite"
						}
						description={
							scheduled
								? firstSessionStart
									? formatStart(firstSessionStart)
									: "Todavía sin sesiones con fecha."
								: "Hasta que se cierren desde Impartición."
						}
					/>
					<OptionRow value="date" label="Hasta el">
						<Input
							id={ids.enrollmentDeadline}
							type="date"
							aria-label="Fecha límite de inscripción"
							disabled={!byDate}
							aria-invalid={Boolean(errors.enrollmentDeadline)}
							className="h-8 w-40"
							{...deadlineField}
							ref={(element) => {
								deadlineField.ref(element);
								deadlineRef.current = element;
							}}
						/>
					</OptionRow>
				</OptionGroup>
			</div>

			<div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<Eye className="size-4" aria-hidden="true" />
				</span>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="font-medium text-sm">
						{isPublished ? "Así está publicado" : "Al publicarlo"}
					</span>
					<p className="text-muted-foreground text-sm" aria-live="polite">
						{summary}
					</p>
				</div>
			</div>
		</>
	);
});
