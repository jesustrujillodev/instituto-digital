import { ChevronDown, CircleAlert, CircleCheck } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import type { CourseStep, CourseStepKey } from "../utils/course-wizard-steps";

type StepState = "done" | "pending" | "error" | "neutral";

interface CourseWizardStepperProps {
	/** `null` mientras el borrador no existe: no hay a dónde saltar todavía. */
	hrefOf: (number: number) => string | null;
	/**
	 * El alta marca lo resuelto y lo pendiente; la edición recorre un curso ya
	 * publicado, donde no queda nada por resolver y solo importan los errores.
	 */
	tracksProgress: boolean;
	/** Los pasos que este curso recorre: un calendarizado no ve Contenido. */
	steps: readonly CourseStep[];
	current: number;
	pending: ReadonlySet<CourseStepKey>;
	errors: ReadonlySet<CourseStepKey>;
}

const stateOf = (
	step: CourseStep,
	pending: ReadonlySet<CourseStepKey>,
	errors: ReadonlySet<CourseStepKey>,
	tracksProgress: boolean,
): StepState => {
	if (errors.has(step.key)) return "error";
	if (!tracksProgress) return "neutral";
	if (pending.has(step.key)) return "pending";

	return "done";
};

const stateLabel = (state: StepState) =>
	state === "error"
		? " (con errores)"
		: state === "pending"
			? " (pendiente)"
			: "";

/**
 * Marca del paso: su número mientras algo falta, una palomita cuando no.
 *
 * Lo resuelto no sale de haber visitado el paso sino de `publishChecklist()`,
 * así que el índice y los pendientes de la ficha nunca se contradicen.
 */
function StepMark({
	position,
	isLast,
	state,
	isCurrent,
}: {
	/** La posición VISIBLE, no `step.number`: el 5 puede no pintarse. */
	position: number;
	isLast: boolean;
	state: StepState;
	isCurrent: boolean;
}) {
	if (state === "error") {
		return (
			<CircleAlert
				className="size-6 shrink-0 text-destructive"
				aria-hidden="true"
			/>
		);
	}

	if (state === "done" && !isLast) {
		return (
			<CircleCheck
				className="size-6 shrink-0 text-success-foreground"
				aria-hidden="true"
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-xs tabular-nums transition-colors duration-150",
				isCurrent
					? "bg-primary text-primary-foreground"
					: "text-muted-foreground ring-1 ring-border ring-inset",
			)}
		>
			{position}
		</span>
	);
}

function StepRow({
	step,
	position,
	isLast,
	state,
	isCurrent,
	to,
}: {
	step: CourseStep;
	position: number;
	isLast: boolean;
	state: StepState;
	isCurrent: boolean;
	to: string | null;
}) {
	const body = (
		<>
			<StepMark
				position={position}
				isLast={isLast}
				state={state}
				isCurrent={isCurrent}
			/>
			<span className="flex min-w-0 flex-col">
				<span className={cn("text-sm", isCurrent && "font-medium")}>
					{step.title}
				</span>
				<span className="text-muted-foreground text-xs">{step.summary}</span>
			</span>
			<span className="sr-only">{stateLabel(state)}</span>
		</>
	);

	const className = cn(
		"flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150",
		isCurrent ? "bg-muted text-foreground" : "text-muted-foreground",
		to && "hover:bg-muted hover:text-foreground",
		to &&
			"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
	);

	if (!to) {
		return (
			<span className={cn(className, "opacity-60")} aria-disabled="true">
				{body}
			</span>
		);
	}

	return (
		<Link
			to={to}
			aria-current={isCurrent ? "step" : undefined}
			className={className}
		>
			{body}
		</Link>
	);
}

function StepList({
	hrefOf,
	tracksProgress,
	steps,
	current,
	pending,
	errors,
}: CourseWizardStepperProps) {
	return (
		<ol className="flex flex-col gap-1">
			{steps.map((step, index) => (
				<li key={step.key}>
					<StepRow
						step={step}
						position={index + 1}
						isLast={index === steps.length - 1}
						state={stateOf(step, pending, errors, tracksProgress)}
						isCurrent={step.number === current}
						to={hrefOf(step.number)}
					/>
				</li>
			))}
		</ol>
	);
}

/**
 * El índice en escritorio: una sola fila con los pasos unidos por un trazo.
 *
 * Solo el paso actual conserva su nombre en pantallas medianas; los demás lo
 * recuperan cuando hay ancho para los seis sin encimarse.
 */
function StepBar({
	hrefOf,
	tracksProgress,
	steps,
	current,
	pending,
	errors,
}: CourseWizardStepperProps) {
	return (
		<ol className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
			{steps.map((step, index) => {
				const state = stateOf(step, pending, errors, tracksProgress);
				const isCurrent = step.number === current;
				const isLast = index === steps.length - 1;
				const to = hrefOf(step.number);

				const body = (
					<>
						<StepMark
							position={index + 1}
							isLast={isLast}
							state={state}
							isCurrent={isCurrent}
						/>
						<span
							className={cn(
								"whitespace-nowrap text-sm",
								isCurrent
									? "font-medium text-foreground"
									: "sr-only xl:not-sr-only",
							)}
						>
							{step.title}
						</span>
						<span className="sr-only">{stateLabel(state)}</span>
					</>
				);

				const className = cn(
					"flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-muted-foreground transition-colors duration-150",
					to &&
						"hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
				);

				return (
					<li
						key={step.key}
						className={cn("flex items-center gap-2", !isLast && "flex-1")}
					>
						{to ? (
							<Link
								to={to}
								aria-current={isCurrent ? "step" : undefined}
								title={step.summary}
								className={className}
							>
								{body}
							</Link>
						) : (
							<span
								className={cn(className, "opacity-60")}
								aria-disabled="true"
							>
								{body}
							</span>
						)}
						{!isLast && (
							<span
								aria-hidden="true"
								className="h-px min-w-3 flex-1 bg-border"
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}

/** Índice del alta: dónde vas, qué falta y cómo volver a cualquier paso. */
export function CourseWizardStepper(props: CourseWizardStepperProps) {
	const { current, steps } = props;
	const index = steps.findIndex((entry) => entry.number === current);
	const step = steps[index];
	const visible = index + 1;
	const total = steps.length;
	const position = `Paso ${visible} de ${total}`;

	return (
		<>
			<nav aria-label="Pasos del curso" className="hidden lg:block">
				<StepBar {...props} />
			</nav>

			{/* En móvil el índice no cabe como fila: se reduce a la posición, una
			    barra de avance y un desplegable con los mismos pasos. */}
			<nav
				aria-label="Pasos del curso"
				className="flex flex-col gap-2 lg:hidden"
			>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							className="h-auto justify-between px-2 py-1.5"
						>
							<span className="flex min-w-0 flex-col items-start">
								<span className="text-muted-foreground text-xs">
									{position}
								</span>
								<span className="font-medium text-sm">{step?.title}</span>
							</span>
							<ChevronDown className="size-4 shrink-0" aria-hidden="true" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 p-1">
						<StepList {...props} />
					</PopoverContent>
				</Popover>

				<div
					className="h-0.5 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-valuenow={visible}
					aria-valuemin={1}
					aria-valuemax={total}
					aria-label={position}
				>
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
						style={{ width: `${(visible / total) * 100}%` }}
					/>
				</div>
			</nav>
		</>
	);
}
