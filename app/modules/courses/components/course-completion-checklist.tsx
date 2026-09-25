import type { ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	type CourseCompletionRule,
	countsAttendance,
	countsContent,
} from "../domain/course.rules";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";

/** Lo que el temario aporta a la fila de contenido. */
export interface CompletionContentFacts {
	requiredLessons: number;
	moduleEvaluations: number;
}

/** Las dos casillas de la regla, de vuelta a la regla que se guarda. */
const ruleOf = (attendance: boolean, content: boolean): CourseCompletionRule =>
	attendance && content ? "BOTH" : content ? "CONTENT" : "ATTENDANCE";

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

const contentDescription = (facts: CompletionContentFacts | null) => {
	if (!facts) {
		return "Las lecciones se arman en Contenido, que se agrega al continuar.";
	}
	const lessons =
		facts.requiredLessons === 0
			? "Todavía no hay lecciones obligatorias en Contenido"
			: `${plural(facts.requiredLessons, "lección marcada", "lecciones marcadas")} como obligatorias en Contenido`;

	return facts.moduleEvaluations === 0
		? `${lessons}.`
		: `${lessons}, y ${plural(facts.moduleEvaluations, "evaluación de módulo", "evaluaciones de módulo")} que hay que aprobar.`;
};

function Requirement({
	id,
	checked,
	disabled,
	onCheckedChange,
	title,
	children,
	aside,
}: {
	id: string;
	checked: boolean;
	disabled: boolean;
	onCheckedChange: (checked: boolean) => void;
	title: string;
	children: ReactNode;
	aside?: ReactNode;
}) {
	return (
		<li className="flex items-start gap-3 px-4 py-3.5">
			<Checkbox
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onCheckedChange(value === true)}
				className="mt-0.5"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<Label
					htmlFor={id}
					className={cn("font-medium text-sm", disabled && "cursor-default")}
				>
					{title}
				</Label>
				<div className="text-muted-foreground text-xs">{children}</div>
			</div>
			{aside && <div className="shrink-0">{aside}</div>}
		</li>
	);
}

/**
 * Qué hace falta para completar el curso, como una lista de requisitos.
 *
 * Asistencia y contenido son las dos casillas de `completionRule` (nunca las
 * dos vacías); la evaluación final es `requiresEvaluation`. Un autogestivo se
 * completa siempre por su contenido: esa casilla va marcada y fija.
 */
export function CourseCompletionChecklist({
	ids,
	scheduled,
	locked,
	content,
	contentHref,
}: {
	ids: CourseFormIds;
	scheduled: boolean;
	/** Autogestivo publicado: ya otorga créditos y no cambia (docs/adr/0014). */
	locked: boolean;
	content: CompletionContentFacts | null;
	contentHref: string | null;
}) {
	const {
		control,
		register,
		setValue,
		formState: { errors },
	} = useFormContext<CourseFormValues>();
	const completionRule = useWatch<CourseFormValues, "completionRule">({
		name: "completionRule",
	});
	const attendance = countsAttendance(completionRule);
	const byContent = countsContent(completionRule);

	const setRule = (next: CourseCompletionRule) =>
		setValue("completionRule", next, {
			shouldDirty: true,
			shouldValidate: true,
		});

	const errorMessage =
		errors.completionRule?.message ?? errors.minAttendance?.message;

	return (
		<section
			className="flex flex-col gap-3"
			aria-labelledby={`${ids.completionRule}-title`}
		>
			<div className="flex flex-col gap-1">
				<h3 id={`${ids.completionRule}-title`} className="font-medium text-sm">
					Para completar el curso hay que…
				</h3>
				{locked && (
					<p className="text-muted-foreground text-xs">
						El curso ya está publicado y otorga créditos: estos requisitos no se
						pueden cambiar.
					</p>
				)}
			</div>

			<ul
				id={ids.completionRule}
				className="divide-y divide-border rounded-xl border border-border bg-card"
			>
				{scheduled && (
					<Requirement
						id={`${ids.completionRule}-attendance`}
						checked={attendance}
						// La última casilla marcada no se puede quitar: algo tiene que completar.
						disabled={locked || (attendance && !byContent)}
						onCheckedChange={(checked) => setRule(ruleOf(checked, byContent))}
						title="Asistir a las sesiones"
					>
						{attendance ? (
							<span className="flex flex-wrap items-center gap-1.5">
								Al menos
								<Input
									id={ids.minAttendance}
									type="number"
									inputMode="numeric"
									min={1}
									max={100}
									aria-label="Asistencia mínima (%)"
									aria-invalid={Boolean(errors.minAttendance)}
									className="h-7 w-16 px-2 text-center text-xs tabular-nums"
									{...register("minAttendance")}
								/>
								% de las sesiones del curso.
							</span>
						) : (
							"Quien asiste pasa lista con el QR de cada sesión."
						)}
					</Requirement>
				)}

				<Requirement
					id={`${ids.completionRule}-content`}
					checked={byContent}
					disabled={locked || !scheduled || (byContent && !attendance)}
					onCheckedChange={(checked) => setRule(ruleOf(attendance, checked))}
					title="Terminar las lecciones obligatorias"
					aside={
						content && contentHref ? (
							<Link
								to={contentHref}
								className="rounded text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
							>
								Ver en Contenido
							</Link>
						) : null
					}
				>
					{contentDescription(content)}
					{!scheduled &&
						" Un autogestivo se completa siempre por su contenido."}
				</Requirement>

				<Controller
					control={control}
					name="requiresEvaluation"
					render={({ field }) => (
						<Requirement
							id={ids.requiresEvaluation}
							checked={field.value}
							disabled={locked}
							onCheckedChange={field.onChange}
							title="Aprobar una evaluación final"
						>
							El resultado queda como aprobado o no aprobado, con su
							calificación.
						</Requirement>
					)}
				/>
			</ul>

			{errorMessage && (
				<span role="alert" className="text-destructive text-sm">
					{errorMessage}
				</span>
			)}
		</section>
	);
}
