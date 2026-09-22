import * as v from "valibot";
import { zonedYearOf } from "@/lib/date-utils";
import {
	COURSE_MODALITIES,
	type CourseStatus,
} from "@/modules/courses/domain/course.rules";
import {
	MONTHS,
	PLAN_CREATABLE_AHEAD,
	PLAN_TEXT_LIMITS,
	PLAN_YEAR_RANGE,
	type PlanLineStatus,
} from "./annual-plan.config";
import {
	AnnualPlanInvalidYearError,
	AnnualPlanLineCancelledError,
	AnnualPlanLineHasActiveCourseError,
	AnnualPlanLineHasCoursesError,
	AnnualPlanLineNotCancelledError,
	AnnualPlanReadOnlyError,
} from "./annual-plan.errors";
import type { PlanProgress, StoredPlanLine } from "./annual-plan.types";

const documentId = v.pipe(
	v.string("Falta el identificador del registro."),
	v.uuid("El identificador del registro no es válido."),
);

const fiscalYear = v.pipe(
	v.number("El ejercicio debe ser un número."),
	v.integer("El ejercicio debe ser un año entero."),
	v.minValue(
		PLAN_YEAR_RANGE.min,
		`El ejercicio no puede ser anterior a ${PLAN_YEAR_RANGE.min}.`,
	),
	v.maxValue(
		PLAN_YEAR_RANGE.max,
		`El ejercicio no puede ser posterior a ${PLAN_YEAR_RANGE.max}.`,
	),
);

/** `label` nombra el campo en el mensaje: los tres campos libres comparten forma. */
const optionalText = (label: string, max: number) =>
	v.pipe(
		v.optional(v.nullable(v.string(`${label} debe ser texto.`)), null),
		v.transform((value) => value?.trim() || null),
		v.nullable(
			v.pipe(
				v.string(`${label} debe ser texto.`),
				v.maxLength(max, `${label} no puede superar los ${max} caracteres.`),
			),
		),
	);

// ── Contratos de entrada ──────────────────────────────────────────────────────

export const findPlanRule = v.object({ documentId });

export const createPlanRule = v.object({ fiscalYear });

export const listPlansRule = v.object({
	/** Solo lo lee el alcance global. */
	dependency: v.optional(documentId),
	fiscalYear: v.optional(fiscalYear),
});

export const planLineRule = v.object({
	title: v.pipe(
		v.string("El título es obligatorio."),
		v.trim(),
		v.minLength(1, "El título es obligatorio."),
		v.maxLength(
			PLAN_TEXT_LIMITS.title,
			`El título no puede superar los ${PLAN_TEXT_LIMITS.title} caracteres.`,
		),
	),
	plannedMonth: v.pipe(
		v.number("Elige el mes en que se impartirá."),
		v.integer("El mes debe ser un número entero."),
		v.minValue(1, "Elige un mes entre enero y diciembre."),
		v.maxValue(12, "Elige un mes entre enero y diciembre."),
	),
	plannedModality: v.optional(
		v.nullable(v.picklist(COURSE_MODALITIES, "Elige una modalidad válida.")),
		null,
	),
	estimatedDuration: optionalText(
		"La duración estimada",
		PLAN_TEXT_LIMITS.estimatedDuration,
	),
	targetAudience: optionalText(
		"El público objetivo",
		PLAN_TEXT_LIMITS.targetAudience,
	),
	notes: optionalText("Las notas", PLAN_TEXT_LIMITS.notes),
});

export const annualPlanRules = {
	find: findPlanRule,
	create: createPlanRule,
	list: listPlansRule,
	line: planLineRule,
} as const;

// ── Estado derivado (§6.11) ───────────────────────────────────────────────────

/** El curso vinculado que cuenta: el que no está cancelado. */
export const activeCourseOf = <T extends { status: CourseStatus }>(
	courses: readonly T[],
): T | null => courses.find((course) => course.status !== "CANCELLED") ?? null;

/**
 * Nadie escribe el estado: sale de la cancelación manual y del curso activo.
 * Un curso cancelado devuelve la línea a pendiente sin tocarla.
 */
export const planLineStatusOf = (line: {
	cancelledAt: Date | null;
	courses: readonly { status: CourseStatus }[];
}): PlanLineStatus => {
	if (line.cancelledAt !== null) return "CANCELLED";

	const active = activeCourseOf(line.courses);
	if (!active) return "PENDING";
	return active.status === "FINISHED" ? "DONE" : "SCHEDULED";
};

export const planProgressOf = (
	lines: readonly Parameters<typeof planLineStatusOf>[0][],
): PlanProgress => {
	const statuses = lines.map(planLineStatusOf);
	const done = statuses.filter((status) => status === "DONE").length;
	const cancelled = statuses.filter((status) => status === "CANCELLED").length;
	const measurable = lines.length - cancelled;

	return {
		done,
		total: lines.length,
		cancelled,
		ratio: measurable === 0 ? null : done / measurable,
	};
};

export const groupLinesByMonth = <T extends { plannedMonth: number }>(
	lines: readonly T[],
): { month: number; lines: T[] }[] =>
	MONTHS.map((month) => ({
		month,
		lines: lines.filter((line) => line.plannedMonth === month),
	}));

// ── Ejercicios ────────────────────────────────────────────────────────────────

export const currentFiscalYear = (now: Date): number => zonedYearOf(now);

export const isReadOnlyPlan = (plan: { fiscalYear: number }, now: Date) =>
	plan.fiscalYear < currentFiscalYear(now);

export const assertPlanWritable = (plan: { fiscalYear: number }, now: Date) => {
	if (isReadOnlyPlan(plan, now)) {
		throw new AnnualPlanReadOnlyError(plan.fiscalYear);
	}
};

/** Del ejercicio actual en adelante, sin pasar del horizonte que se ofrece. */
export const assertCreatableYear = (fiscalYear: number, now: Date) => {
	const current = currentFiscalYear(now);
	if (fiscalYear < current || fiscalYear > current + PLAN_CREATABLE_AHEAD) {
		throw new AnnualPlanInvalidYearError(fiscalYear);
	}
};

export const creatableYearsOf = (
	existingYears: readonly number[],
	now: Date,
): number[] => {
	const current = currentFiscalYear(now);
	return Array.from(
		{ length: PLAN_CREATABLE_AHEAD + 1 },
		(_, i) => current + i,
	).filter((year) => !existingYears.includes(year));
};

// ── Operaciones sobre una línea ───────────────────────────────────────────────

type LineState = Pick<StoredPlanLine, "cancelledAt"> & {
	courses: readonly { status: CourseStatus }[];
};

/** Para "Crear curso desde esta línea" (§6.11). */
export const assertLineAvailableForCourse = (
	line: LineState,
	plan: { fiscalYear: number },
	now: Date,
) => {
	assertPlanWritable(plan, now);
	if (line.cancelledAt !== null) throw new AnnualPlanLineCancelledError();
	if (activeCourseOf(line.courses)) {
		throw new AnnualPlanLineHasActiveCourseError();
	}
};

/** Cancelar una línea con curso vivo dejaría un curso sin plan a la vista. */
export const assertLineCancellable = (line: LineState) => {
	if (line.cancelledAt !== null) throw new AnnualPlanLineCancelledError();
	if (activeCourseOf(line.courses)) {
		throw new AnnualPlanLineHasActiveCourseError();
	}
};

export const assertLineReactivable = (line: LineState) => {
	if (line.cancelledAt === null) throw new AnnualPlanLineNotCancelledError();
};

export const assertLineDeletable = (line: LineState) => {
	if (line.courses.length > 0) throw new AnnualPlanLineHasCoursesError();
};

export const assertLineEditable = (line: LineState) => {
	if (line.cancelledAt !== null) throw new AnnualPlanLineCancelledError();
};
