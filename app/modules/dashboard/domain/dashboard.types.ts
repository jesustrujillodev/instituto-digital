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

/** Algo que pide atención hoy, con la acción que lo resuelve. */
export type TodayItem =
	| (TodayCourse & {
			kind: "session";
			role: "teaching" | "learning";
			sessionDocumentId: string;
			startsAt: Date;
			endsAt: Date;
			venue: string | null;
			link: string | null;
			inProgress: boolean;
	  })
	| (TodayCourse & { kind: "pendingFinish"; lastSessionEndsAt: Date })
	| (TodayCourse & { kind: "invitation"; closesAt: Date | null });

/** Lo siguiente de la semana, para cuando hoy no hay nada. */
export interface NextUp {
	title: string;
	startsAt: Date;
	role: "teaching" | "learning";
}

export interface DashboardToday {
	items: TodayItem[];
	/** Los que no cupieron. */
	overflow: number;
	nextUp: NextUp | null;
}

export interface DashboardHeader {
	firstName: string | null;
	dependencyName: string | null;
}

export interface DashboardLearning {
	courses: MyCoursesDigest;
	/** Las que no urgen: las urgentes ya van en «Para hoy». */
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

export interface DashboardData {
	header: DashboardHeader;
	facets: DashboardFacets;
	/** `null` para quien no cursa, no imparte ni organiza. */
	today: DashboardToday | null;
	week: CalendarWeek;
	platform: DashboardPlatform | null;
	organizing: DashboardOrganizing | null;
	learning: DashboardLearning | null;
}
