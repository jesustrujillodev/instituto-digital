import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { ICradle } from "@/shared/di/container.types";
import { ok } from "@/shared/response/response.helpers";
import { createOperationRunner } from "@/shared/response/run-operation";
import { calendarCourseWhere } from "../domain/calendar.access";
import {
	applyCalendarFilters,
	canToggleStaff,
	currentMonth,
	filterOptionsOf,
	periodRange,
	resolveCalendarPlan,
	toCalendarPeriod,
	toCalendarSessions,
} from "../domain/calendar.rules";
import type { ICalendarService } from "../domain/calendar.service";
import type {
	CalendarFilters,
	CalendarQueryDto,
} from "../domain/calendar.types";
import { upcomingWeekOf } from "../domain/calendar-week.rules";

type Dependencies = {
	calendarRepository: ICradle["calendarRepository"];
	clock: ICradle["clock"];
	logger: ICradle["logger"];
};

export const createCalendarService = ({
	calendarRepository,
	clock,
	logger,
}: Dependencies): ICalendarService => {
	const run = createOperationRunner(logger.child({ module: "calendar" }));

	return {
		async listSessions(query: CalendarQueryDto, actor: AuthContext) {
			return run("listSessions", async () => {
				const plan = resolveCalendarPlan(actor, query.staff);
				const period = toCalendarPeriod(
					query.month ?? currentMonth(clock.now()),
				);
				const { from, to } = periodRange(period);

				const rows = await calendarRepository.findSessions({
					from,
					to,
					courseFilter: calendarCourseWhere(plan),
					viewerId: plan.viewerId,
					staffDependencyId: plan.staffDependencyId,
				});

				const visible = toCalendarSessions(plan, rows);
				const filters: CalendarFilters = {
					dependency: query.dependency ?? null,
					modality: query.modality ?? null,
					trainer: query.trainer ?? null,
					staff: plan.staffDependencyId !== null,
				};

				return ok({
					period,
					view: query.view,
					sessions: applyCalendarFilters(visible, filters),
					filters,
					options: {
						...filterOptionsOf(visible),
						canToggleStaff: canToggleStaff(plan),
					},
				});
			});
		},

		async listWeek(actor: AuthContext, { limit }: { limit: number }) {
			return run("listWeek", async () => {
				const plan = resolveCalendarPlan(actor, false);
				const { today, days, from, to } = upcomingWeekOf(clock.now());

				// Una fila de más dice si hubo recorte sin un conteo aparte.
				const rows = await calendarRepository.findSessions({
					from,
					to,
					courseFilter: calendarCourseWhere(plan),
					viewerId: plan.viewerId,
					staffDependencyId: null,
					limit: limit + 1,
				});

				const sessions = toCalendarSessions(plan, rows.slice(0, limit));

				return ok({ today, days, sessions, truncated: rows.length > limit });
			});
		},
	};
};
