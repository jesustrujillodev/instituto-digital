/**
 * Estado de una línea. No es un enum de la base: se deriva del curso vinculado
 * y de la cancelación manual (docs/adr/0007).
 */
export const PLAN_LINE_STATUSES = [
	"PENDING",
	"SCHEDULED",
	"DONE",
	"CANCELLED",
] as const;
export type PlanLineStatus = (typeof PLAN_LINE_STATUSES)[number];

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Ejercicios que se aceptan al crear o filtrar. */
export const PLAN_YEAR_RANGE = { min: 2000, max: 2100 } as const;

/** Cuántos ejercicios por delante se ofrece crear, contando el actual. */
export const PLAN_CREATABLE_AHEAD = 1;

export const PLAN_TEXT_LIMITS = {
	title: 200,
	estimatedDuration: 100,
	targetAudience: 200,
	notes: 2000,
} as const;
