import type {
	CurrentPlanSummary,
	PlanCoverage,
} from "@/modules/annual-plan/domain/annual-plan.types";
import type { CalendarWeek } from "@/modules/calendar/domain/calendar.types";
import type { MyCertificate } from "@/modules/certificates/domain/certificate.types";
import type { CourseAttention } from "@/modules/courses/domain/course-attention.types";
import type { YearCredits } from "@/modules/credits/domain/credit.types";
import type { DependencyRef } from "@/modules/dependencies/domain/dependency.types";
import type {
	MyCourseInvitation,
	MyCoursesDigest,
	OpenEnrollmentSummary,
} from "@/modules/enrollments/domain/enrollment-summary.types";
import type { OperationsHealth } from "@/modules/operations/domain/operations.types";

/**
 * Las responsabilidades de quien entra. Se acumulan: un titular también cursa
 * y puede impartir, y cada una abre su parte del panel.
 */
export interface DashboardFacets {
	/** Cursa: tiene dependencia y no es superadministrador. */
	participates: boolean;
	/** Tiene perfil de capacitador. */
	teaches: boolean;
	/** Organiza cursos: los de su dependencia, o los que creó como capacitador interno. */
	organizes: boolean;
	/** Escribe el plan anual de su dependencia. */
	plans: boolean;
	platform: boolean;
}

interface TodayCourse {
	courseDocumentId: string;
	title: string;
	href: string;
}

/** Una sesión de hoy que todavía no termina, desde el lado que le toca. */
export interface TodaySession extends TodayCourse {
	role: "teaching" | "learning";
	sessionDocumentId: string;
	startsAt: Date;
	endsAt: Date;
	venue: string | null;
	link: string | null;
	inProgress: boolean;
}

export interface DashboardToday {
	sessions: TodaySession[];
	/** Las que no cupieron. */
	overflow: number;
}

/** Algo que espera una decisión de quien entra, con la pantalla que lo resuelve. */
export type AttentionItem =
	| (TodayCourse & { kind: "pendingFinish"; lastSessionEndsAt: Date })
	| (TodayCourse & { kind: "invitation"; closesAt: Date | null })
	| (TodayCourse & { kind: "withoutTrainer"; firstSessionAt: Date | null })
	| {
			kind: "overdueLine";
			lineDocumentId: string;
			title: string;
			plannedMonth: number;
			href: string;
	  }
	| (TodayCourse & { kind: "draft"; updatedAt: Date });

export type AttentionKind = AttentionItem["kind"];

export interface DashboardAttention {
	items: AttentionItem[];
	/** Listas que se leyeron recortadas: la pantalla dueña tiene el resto. */
	more: Record<Exclude<AttentionKind, "invitation">, boolean>;
}

export interface DashboardHeader {
	firstName: string | null;
	dependencyName: string | null;
}

export interface DashboardLearning {
	courses: MyCoursesDigest;
	/** Las que no urgen: las urgentes ya van en «Requiere tu atención». */
	invitations: MyCourseInvitation[];
	certificates: MyCertificate[];
	credits: YearCredits;
}

export interface DashboardOrganizing {
	plan: CurrentPlanSummary | null;
	attention: CourseAttention;
	openEnrollment: OpenEnrollmentSummary;
}

export interface DashboardPlatform {
	withoutHead: DependencyRef[];
	activeSessions: number;
	coverage: PlanCoverage;
	health: OperationsHealth;
}

/** Lo que la plataforma no pudo resolver sola, con la pantalla que lo resuelve. */
export type PlatformAttentionItem =
	| { kind: "emails"; failed: number; stuck: number }
	| { kind: "jobs"; failed: number; windowDays: number }
	| { kind: "withoutHead"; dependency: DependencyRef; withoutPlan: boolean };

export interface PlatformAttentionList {
	items: PlatformAttentionItem[];
	/** Dependencias sin titular que no cupieron. */
	overflow: number;
}

export interface CoverageTotals {
	done: number;
	/** Lo vigente: lo planeado menos lo cancelado. */
	active: number;
	/** `null` si ningún plan tiene nada vigente. */
	ratio: number | null;
	withPlan: number;
	dependencies: number;
}

export interface DashboardData {
	header: DashboardHeader;
	facets: DashboardFacets;
	/** `null` para quien no cursa, no imparte ni organiza. */
	today: DashboardToday | null;
	/** Mismo criterio que `today`. */
	attention: DashboardAttention | null;
	week: CalendarWeek;
	platform: DashboardPlatform | null;
	organizing: DashboardOrganizing | null;
	learning: DashboardLearning | null;
}
