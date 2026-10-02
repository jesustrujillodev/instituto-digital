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
	/** Pasos con pendientes de publicación, todos ya resueltos. */
	resolved: ReadonlySet<CourseStepKey>;
	errors: ReadonlySet<CourseStepKey>;
	/** Pasos que acaba de sumar una elección todavía sin guardar. */
	added: ReadonlySet<CourseStepKey>;
}

/** Avisa que el índice creció por lo que se acaba de elegir. */
function NewTag() {
	return (
		<span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-xs leading-none">
			Nuevo
		</span>
	);
}

/**
 * Un paso sin pendientes no está hecho por eso: General nunca tiene, y un borrador
 * recién creado tampoco. Cuenta como hecho si resolvió sus pendientes o si ya se
 * dejó atrás.
 */
const stateOf = (
	step: CourseStep,
	{
		pending,
		resolved,
		errors,
		tracksProgress,
		current,
	}: Pick<
		CourseWizardStepperProps,
		"pending" | "resolved" | "errors" | "tracksProgress" | "current"
	>,
): StepState => {
	if (errors.has(step.key)) return "error";
	if (!tracksProgress) return "neutral";
	if (pending.has(step.key)) return "pending";
	if (resolved.has(step.key) || step.number < current) return "done";

	return "pending";
};

const stateLabel = (state: StepState) =>
	state === "error"
		? " (con errores)"
		: state === "pending"
			? " (pendiente)"
			: "";

/**
 * Marca del paso: su número mientras no está hecho, una palomita cuando sí.
 *
 * Un pendiente de `publishChecklist()` siempre gana, así que el índice y los
 * pendientes de la ficha nunca se contradicen.
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
	isAdded,
	to,
}: {
	step: CourseStep;
	position: number;
	isLast: boolean;
	state: StepState;
	isCurrent: boolean;
	isAdded: boolean;
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
				<span
					className={cn(
						"flex items-center gap-1.5 text-sm",
						isCurrent && "font-medium",
					)}
				>
					{step.title}
					{isAdded && <NewTag />}
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

function StepList(props: CourseWizardStepperProps) {
	const { hrefOf, steps, current, added } = props;

	return (
		<ol className="flex flex-col gap-1">
			{steps.map((step, index) => (
				<li key={step.key}>
					<StepRow
						step={step}
						position={index + 1}
						isLast={index === steps.length - 1}
						state={stateOf(step, props)}
						isCurrent={step.number === current}
						isAdded={added.has(step.key)}
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
function StepBar(props: CourseWizardStepperProps) {
	const { hrefOf, steps, current, added } = props;

	return (
		<ol className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
			{steps.map((step, index) => {
				const state = stateOf(step, props);
				const isCurrent = step.number === current;
				const isLast = index === steps.length - 1;
				const isAdded = added.has(step.key);
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
									: !isAdded && "sr-only xl:not-sr-only",
							)}
						>
							{step.title}
						</span>
						{isAdded && <NewTag />}
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
			<nav aria-label="Pasos de la capacitación" className="hidden lg:block">
				<StepBar {...props} />
			</nav>

			{/* En móvil el índice no cabe como fila: se reduce a la posición, una
			    barra de avance y un desplegable con los mismos pasos. */}
			<nav
				aria-label="Pasos de la capacitación"
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
