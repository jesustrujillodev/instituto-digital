import { Lock } from "lucide-react";
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

const contentDescription = (
	facts: CompletionContentFacts | null,
	fixed: boolean,
) => {
	const lead = fixed ? "Siempre se pide cuando hay contenido a su ritmo." : "";
	if (!facts) {
		return [
			lead,
			"Las lecciones se arman en Contenido, que se agrega al continuar.",
		]
			.filter(Boolean)
			.join(" ");
	}
	const lessons =
		facts.requiredLessons === 0
			? "Todavía no hay lecciones obligatorias."
			: `Hoy son ${plural(facts.requiredLessons, "lección", "lecciones")}${
					facts.moduleEvaluations === 0
						? "."
						: ` y ${plural(facts.moduleEvaluations, "evaluación de módulo", "evaluaciones de módulo")}.`
				}`;
	return [lead, lessons].filter(Boolean).join(" ");
};

function Requirement({
	id,
	checked,
	disabled,
	fixed = false,
	onCheckedChange,
	title,
	children,
	aside,
	expanded,
}: {
	id: string;
	checked: boolean;
	disabled: boolean;
	/** Se pide siempre: un candado en vez de casilla. */
	fixed?: boolean;
	onCheckedChange: (checked: boolean) => void;
	title: string;
	children: ReactNode;
	aside?: ReactNode;
	/** Lo que se configura cuando el requisito está marcado. */
	expanded?: ReactNode;
}) {
	return (
		<li className="flex flex-col gap-4 px-4 py-3.5">
			<div className="flex items-start gap-3">
				{fixed ? (
					<span
						className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-muted text-muted-foreground"
						aria-hidden="true"
					>
						<Lock className="size-3" />
					</span>
				) : (
					<Checkbox
						id={id}
						checked={checked}
						disabled={disabled}
						onCheckedChange={(value) => onCheckedChange(value === true)}
						className="mt-0.5"
					/>
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					{fixed ? (
						<span className="font-medium text-sm">{title}</span>
					) : (
						<Label
							htmlFor={id}
							className={cn(
								"font-medium text-sm",
								disabled && "cursor-default",
							)}
						>
							{title}
						</Label>
					)}
					<div className="text-muted-foreground text-xs">{children}</div>
				</div>
				{aside && <div className="shrink-0">{aside}</div>}
			</div>
			{checked && expanded && <div className="sm:pl-7">{expanded}</div>}
		</li>
	);
}

/**
 * «Requisitos»: qué hace falta para completar el curso.
 *
 * Asistencia y contenido son las dos casillas de `completionRule` (nunca las
 * dos vacías); la evaluación final es `requiresEvaluation` y despliega su
 * examen. Un autogestivo se completa siempre por su contenido: esa fila va con
 * candado.
 */
export function CourseCompletionChecklist({
	ids,
	scheduled,
	locked,
	isPublished,
	content,
	contentHref,
	finalExam,
	finalExamSummary,
}: {
	ids: CourseFormIds;
	scheduled: boolean;
	/** Autogestivo publicado: ya otorga créditos y no cambia (docs/adr/0014). */
	locked: boolean;
	/** Publicado: la evaluación final ya no cambia (docs/adr/0027). */
	isPublished: boolean;
	content: CompletionContentFacts | null;
	contentHref: string | null;
	/** El editor del examen, dentro de su requisito. */
	finalExam?: ReactNode;
	/** "5 preguntas · 5 puntos · se aprueba con 4". */
	finalExamSummary?: string | null;
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
				<h3 id={`${ids.completionRule}-title`} className="font-bold text-lg">
					Requisitos
				</h3>
				{locked && (
					<p className="text-muted-foreground text-xs">
						La capacitación ya está publicada y otorga créditos: estos
						requisitos no se pueden cambiar.
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
								% de las sesiones. Quien asiste pasa lista con el QR de cada
								sesión.
							</span>
						) : (
							"Quien asiste pasa lista con el QR de cada sesión."
						)}
					</Requirement>
				)}

				<Requirement
					id={`${ids.completionRule}-content`}
					checked={byContent}
					fixed={!scheduled}
					disabled={locked || (byContent && !attendance)}
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
					{contentDescription(content, !scheduled)}
				</Requirement>

				<Controller
					control={control}
					name="requiresEvaluation"
					render={({ field }) => (
						<Requirement
							id={ids.requiresEvaluation}
							checked={field.value}
							disabled={locked || isPublished}
							onCheckedChange={field.onChange}
							title="Presentar un examen final"
							aside={
								field.value && finalExamSummary ? (
									<span className="text-muted-foreground text-xs tabular-nums">
										{finalExamSummary}
									</span>
								) : null
							}
							expanded={finalExam}
						>
							Un examen en línea con calificación automática. Su nota entra al
							promedio de la capacitación.
							{isPublished &&
								" La capacitación ya está publicada: no se puede quitar ni agregar."}
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
