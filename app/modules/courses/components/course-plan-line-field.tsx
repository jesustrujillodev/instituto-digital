import { CalendarRange } from "lucide-react";
import { memo, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { MONTH_LABELS } from "@/modules/annual-plan/utils/plan-labels";
import type { CourseDetail, CoursePlanOption } from "../domain/course.types";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import { type ChoiceOption, CourseChoiceField } from "./course-choice-field";
import { CourseSelectField } from "./course-select-field";

const linesLabel = (count: number) =>
	count === 0
		? "Sin líneas pendientes."
		: count === 1
			? "1 línea pendiente."
			: `${count} líneas pendientes.`;

/** El vínculo que ya no se puede tocar, dicho como dato y con su porqué. */
function FixedPlanLine({
	planLine,
	reason,
}: {
	planLine: CourseDetail["planLine"];
	reason: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="font-medium text-sm">Plan anual</span>
			<div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<CalendarRange className="size-4" aria-hidden="true" />
				</span>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="font-medium text-sm">
						{planLine
							? `Plan ${planLine.fiscalYear} · ${planLine.title}`
							: "No forma parte del plan anual"}
					</span>
					<span className="text-muted-foreground text-xs">{reason}</span>
				</div>
			</div>
		</div>
	);
}

interface CoursePlanLineFieldProps {
	ids: CourseFormIds;
	plans: readonly CoursePlanOption[];
	/** `undefined` en el alta: todavía no hay vínculo guardado. */
	course?: Pick<CourseDetail, "status" | "planLine"> | null;
	/** Solo cuando la organizadora se elige: los planes son los de esa. */
	filterByOrganizer: boolean;
}

/**
 * La línea del plan anual que el curso cumple. Opcional: un curso puede no
 * estar previsto en ningún plan. Solo se ofrecen los planes del ejercicio en
 * curso en adelante, y de cada uno las líneas que siguen libres.
 */
export const CoursePlanLineField = memo(function CoursePlanLineField({
	ids,
	plans,
	course,
	filterByOrganizer,
}: CoursePlanLineFieldProps) {
	const { setValue, getValues } = useFormContext<CourseFormValues>();
	const [organizer, plan] = useWatch<CourseFormValues, ["dependency", "plan"]>({
		name: ["dependency", "plan"],
	});

	const available = useMemo(
		() =>
			filterByOrganizer
				? plans.filter((entry) => entry.dependencyDocumentId === organizer)
				: plans,
		[plans, filterByOrganizer, organizer],
	);

	const current = course?.planLine ?? null;

	if (course && course.status !== "DRAFT") {
		return (
			<FixedPlanLine
				planLine={current}
				reason="El plan anual solo se cambia mientras el curso es borrador."
			/>
		);
	}

	// Su plan ya no se ofrece: es de un ejercicio que cerró.
	if (
		current &&
		!plans.some((entry) => entry.documentId === current.planDocumentId)
	) {
		return (
			<FixedPlanLine
				planLine={current}
				reason="Ese plan ya cerró: el vínculo se conserva tal como está."
			/>
		);
	}

	if (filterByOrganizer && organizer === "") {
		return (
			<FixedPlanLine
				planLine={null}
				reason="Elige primero la dependencia organizadora para ver sus planes."
			/>
		);
	}

	if (available.length === 0) {
		return (
			<FixedPlanLine
				planLine={null}
				reason="No hay plan anual del ejercicio en curso ni de los siguientes."
			/>
		);
	}

	const options: ChoiceOption[] = [
		{
			value: "",
			label: "Sin plan anual",
			description: "No cumple ninguna línea prevista.",
		},
		...available.map((entry) => ({
			value: entry.documentId,
			label: `Plan ${entry.fiscalYear}`,
			description: linesLabel(entry.lines.length),
			disabled: entry.lines.length === 0,
		})),
	];

	const selected = available.find((entry) => entry.documentId === plan);

	return (
		<div className="flex flex-col gap-4">
			<CourseChoiceField
				id={ids.plan}
				name="plan"
				legend="Plan anual"
				options={options}
				helperText="Vincúlalo si cumple una línea del plan: el plan contará su avance."
				onChanged={() =>
					setValue("planLine", "", { shouldDirty: true, shouldValidate: false })
				}
			/>

			{selected && (
				<CourseSelectField
					id={ids.planLine}
					name="planLine"
					label="Línea del plan"
					required
					placeholder="Elige la línea"
					options={selected.lines.map((line) => ({
						value: line.documentId,
						label: `${MONTH_LABELS[line.plannedMonth]} · ${line.title}`,
					}))}
					onChanged={(value) => {
						const line = selected.lines.find(
							(entry) => entry.documentId === value,
						);
						if (line && getValues("title").trim() === "") {
							setValue("title", line.title, {
								shouldDirty: true,
								shouldValidate: true,
							});
						}
					}}
				/>
			)}
		</div>
	);
});
