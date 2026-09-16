import type * as v from "valibot";
import type { CourseScope } from "@/modules/courses/domain/course.access";
import type {
	CourseModality,
	CourseStatus,
} from "@/modules/courses/domain/course.rules";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/enrollment.config";
import type { AppResponse } from "@/shared/response/response.types";
import type { CalendarLens, CalendarView } from "./calendar.config";
import type { calendarQueryRule } from "./calendar.validators";

export type CalendarQueryDto = v.InferOutput<typeof calendarQueryRule>;

/** Qué partes del calendario le tocan a quien lo abre. */
export interface CalendarPlan {
	viewerId: number;
	/** Inscrito o invitado: solo quien puede cursar (§6.6). */
	participates: boolean;
	/** Lo que organiza; `global` incluye los borradores de todas las dependencias. */
	organizer: CourseScope;
	/** Dependencia cuyo personal se consulta, o `null` si no se pidió o no aplica. */
	staffDependencyId: number | null;
}

// ── Lo que el repositorio lee ─────────────────────────────────────────────────

export interface CalendarTrainerRow {
	userId: number;
	documentId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
}

export interface CalendarSessionRow {
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
	course: {
		documentId: string;
		title: string;
		modality: CourseModality;
		status: CourseStatus;
		dependencyId: number;
		createdById: number;
		dependency: { documentId: string; name: string };
	};
	trainers: CalendarTrainerRow[];
	/** Invitación pendiente o inscripción activa de quien consulta. */
	viewerStatus: EnrollmentStatus | null;
	/** Alguien de la dependencia consultada está inscrito. */
	staffEnrolled: boolean;
}

// ── Proyecciones ──────────────────────────────────────────────────────────────

export interface CalendarOption {
	documentId: string;
	name: string;
}

export interface CalendarSession {
	documentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
	course: {
		documentId: string;
		title: string;
		modality: CourseModality;
		status: CourseStatus;
		dependency: CalendarOption;
	};
	trainers: CalendarOption[];
	lenses: CalendarLens[];
	/** Detalle del curso que corresponde a quien consulta; `null` si no tiene ninguno. */
	courseHref: string | null;
}

export interface CalendarPeriod {
	month: string;
	previousMonth: string;
	nextMonth: string;
	/** Días `YYYY-MM-DD` de la cuadrícula, en semanas completas de lunes a domingo. */
	days: string[];
}

export interface CalendarFilters {
	dependency: string | null;
	modality: CourseModality | null;
	trainer: string | null;
	staff: boolean;
}

export interface CalendarData {
	period: CalendarPeriod;
	view: CalendarView;
	sessions: CalendarSession[];
	filters: CalendarFilters;
	options: {
		dependencies: CalendarOption[];
		trainers: CalendarOption[];
		canToggleStaff: boolean;
	};
}

export type CalendarResponse = AppResponse<CalendarData>;
