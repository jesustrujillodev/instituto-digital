import { ANNUAL_PLAN_ERROR_MESSAGES } from "@/modules/annual-plan/utils/annual-plan-error-messages";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { SESSION_MONITOR_ERROR_MESSAGES } from "@/modules/auth/utils/session-monitor-error-messages";
import { CALENDAR_ERROR_MESSAGES } from "@/modules/calendar/utils/calendar-error-messages";
import { CERTIFICATE_ERROR_MESSAGES } from "@/modules/certificates/utils/certificate-error-messages";
import { resolveCourseScope } from "@/modules/courses/domain/course.access";
import { COURSE_ERROR_MESSAGES } from "@/modules/courses/utils/course-error-messages";
import { CREDIT_ERROR_MESSAGES } from "@/modules/credits/utils/credit-error-messages";
import { DEPENDENCY_ERROR_MESSAGES } from "@/modules/dependencies/utils/dependency-error-messages";
import { ENROLLMENT_ERROR_MESSAGES } from "@/modules/enrollments/utils/enrollment-error-messages";
import { OPERATIONS_ERROR_MESSAGES } from "@/modules/operations/utils/operations-error-messages";
import { TEACHING_ERROR_MESSAGES } from "@/modules/teaching/utils/teaching-error-messages";
import { USER_ERROR_MESSAGES } from "@/modules/users/utils/user-error-messages";
import type { ICradle } from "@/shared/di/container.types";
import { toRouteError } from "@/shared/http/route-error";
import type { ErrorMessageMap } from "@/shared/response/response.messages";
import type { AppResponse } from "@/shared/response/response.types";
import { DASHBOARD_LIMITS } from "../../domain/dashboard.config";
import {
	buildToday,
	hasTodayPanel,
	resolveDashboardFacets,
	watchesPendingFinish,
} from "../../domain/dashboard.rules";
import type { DashboardData } from "../../domain/dashboard.types";

/** El dato de la lectura, o corta con el status de su diccionario. */
const dataOf = <T>(result: AppResponse<T>, messages: ErrorMessageMap): T => {
	if (!result.success) throw toRouteError(result.error, messages);
	return result.data;
};

/** Lo mismo para una lectura que la faceta pudo saltarse. */
const unwrap = <T>(
	result: AppResponse<T> | null,
	messages: ErrorMessageMap,
): T | null => (result === null ? null : dataOf(result, messages));

const skip = Promise.resolve(null);

/**
 * El panel de inicio. Cada lectura depende solo de quién entra, así que todas
 * van en una sola fase; las de una faceta que la persona no tiene no se hacen.
 * Cada faceta pregunta con la misma condición que el guard de su servicio, así
 * que ningún FORBIDDEN es esperable: un fallo aquí es un fallo de verdad.
 */
export const loadDashboard = async (
	auth: AuthContext,
	context: ICradle,
): Promise<DashboardData> => {
	const facets = resolveDashboardFacets(auth);
	const self = { kind: "self" as const, userId: auth.userId };
	const limit = DASHBOARD_LIMITS;

	const [
		user,
		dependency,
		week,
		courses,
		certificates,
		credits,
		pending,
		attention,
		openEnrollment,
		plan,
		withoutHead,
		activeSessions,
		coverage,
		health,
	] = await Promise.all([
		context.userService.findById(auth.documentId, self),
		auth.dependencyId === null
			? skip
			: context.dependencyService.findByInternalId(auth.dependencyId),
		context.calendarService.listWeek(auth, { limit: limit.weekSessions }),
		facets.participates
			? context.enrollmentSummaryService.summarizeMine(auth, limit)
			: skip,
		facets.participates
			? context.certificateService.listMine(auth, {
					limit: limit.certificates,
				})
			: skip,
		facets.participates ? context.creditService.summarizeYear(auth) : skip,
		watchesPendingFinish(auth)
			? context.teachingService.summarizePending(auth, {
					limit: limit.pendingFinish,
				})
			: skip,
		facets.organizes
			? context.courseAttentionService.summarize(resolveCourseScope(auth), {
					limit: limit.attention,
				})
			: skip,
		facets.organizes
			? context.enrollmentSummaryService.summarizeOpen(auth, {
					limit: limit.openEnrollment,
				})
			: skip,
		facets.plans
			? context.annualPlanService.summarizeCurrent(auth, {
					limit: limit.dueLines,
				})
			: skip,
		facets.platform ? context.dependencyService.listWithoutHead() : skip,
		facets.platform ? context.sessionMonitorService.countActive() : skip,
		facets.platform ? context.annualPlanService.summarizeCoverage(auth) : skip,
		facets.platform ? context.operationsService.summarizeHealth() : skip,
	]);

	const profile = unwrap(user, USER_ERROR_MESSAGES);
	const ownDependency = unwrap(dependency, DEPENDENCY_ERROR_MESSAGES);
	const calendar = dataOf(week, CALENDAR_ERROR_MESSAGES);
	const digest = unwrap(courses, ENROLLMENT_ERROR_MESSAGES);
	const recentCertificates = unwrap(certificates, CERTIFICATE_ERROR_MESSAGES);
	const yearCredits = unwrap(credits, CREDIT_ERROR_MESSAGES);
	const teaching = unwrap(pending, TEACHING_ERROR_MESSAGES);
	const courseAttention = unwrap(attention, COURSE_ERROR_MESSAGES);
	const open = unwrap(openEnrollment, ENROLLMENT_ERROR_MESSAGES);
	const currentPlan = unwrap(plan, ANNUAL_PLAN_ERROR_MESSAGES);
	const headless = unwrap(withoutHead, DEPENDENCY_ERROR_MESSAGES);
	const sessions = unwrap(activeSessions, SESSION_MONITOR_ERROR_MESSAGES);
	const planCoverage = unwrap(coverage, ANNUAL_PLAN_ERROR_MESSAGES);
	const operations = unwrap(health, OPERATIONS_ERROR_MESSAGES);

	const invitations = digest?.invitations ?? [];

	return {
		header: {
			firstName: profile?.firstName ?? null,
			dependencyName: ownDependency?.name ?? null,
		},
		facets,
		today: hasTodayPanel(facets)
			? buildToday(
					{
						now: context.clock.now(),
						week: calendar,
						pendingFinish: teaching?.awaitingFinish ?? [],
						invitations,
					},
					limit.today,
				)
			: null,
		week: calendar,
		platform:
			headless !== null &&
			sessions !== null &&
			planCoverage !== null &&
			operations !== null
				? {
						withoutHead: headless,
						activeSessions: sessions,
						coverage: planCoverage,
						health: operations,
					}
				: null,
		organizing:
			courseAttention !== null && open !== null
				? {
						plan: currentPlan,
						attention: courseAttention,
						openEnrollment: open,
					}
				: null,
		learning:
			digest !== null && recentCertificates !== null && yearCredits !== null
				? {
						courses: digest,
						invitations: invitations.filter(
							(invitation) => !invitation.closesSoon,
						),
						certificates: recentCertificates,
						credits: yearCredits,
					}
				: null,
	};
};
