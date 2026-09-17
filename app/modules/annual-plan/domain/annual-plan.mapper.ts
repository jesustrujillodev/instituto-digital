import {
	activeCourseOf,
	groupLinesByMonth,
	isReadOnlyPlan,
	planLineStatusOf,
	planProgressOf,
} from "./annual-plan.rules";
import type {
	PlanDetail,
	PlanLineView,
	PlanSummary,
	StoredPlan,
	StoredPlanLine,
} from "./annual-plan.types";

export const toPlanLineView = (
	line: StoredPlanLine,
	editable: boolean,
): PlanLineView => {
	const status = planLineStatusOf(line);
	const activeCourse = activeCourseOf(line.courses);
	const open = editable && status !== "CANCELLED";

	return {
		documentId: line.documentId,
		title: line.title,
		plannedMonth: line.plannedMonth,
		plannedModality: line.plannedModality,
		estimatedDuration: line.estimatedDuration,
		targetAudience: line.targetAudience,
		notes: line.notes,
		status,
		activeCourse,
		cancelledCourses: line.courses.filter(
			(course) => course.status === "CANCELLED",
		).length,
		can: {
			edit: open,
			cancel: open && activeCourse === null,
			reactivate: editable && status === "CANCELLED",
			delete: editable && line.courses.length === 0,
			createCourse: open && activeCourse === null,
		},
	};
};

/** Las líneas llegan ordenadas por mes; la vista por mes las agrupa igual. */
export const toPlanDetail = (
	plan: StoredPlan,
	canManage: boolean,
	now: Date,
): PlanDetail => {
	const readOnly = isReadOnlyPlan(plan, now);
	const lines = plan.lines.map((line) =>
		toPlanLineView(line, canManage && !readOnly),
	);

	return {
		plan: {
			documentId: plan.documentId,
			dependencyName: plan.dependencyName,
			fiscalYear: plan.fiscalYear,
		},
		lines,
		months: groupLinesByMonth(lines),
		progress: planProgressOf(plan.lines),
		readOnly,
		canManage: canManage && !readOnly,
	};
};

export const toPlanSummary = (plan: StoredPlan, now: Date): PlanSummary => ({
	documentId: plan.documentId,
	dependencyName: plan.dependencyName,
	fiscalYear: plan.fiscalYear,
	progress: planProgressOf(plan.lines),
	readOnly: isReadOnlyPlan(plan, now),
});
