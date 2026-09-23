import { useFormIds } from "@/shared/hooks/use-form-ids";

const FIELD_KEYS = [
	"title",
	"description",
	"cover",
	"modality",
	"format",
	"completionRule",
	"access",
	"dependency",
	"capacity",
	"enrollmentDeadline",
	"minAttendance",
	"requiresEvaluation",
	"evaluationMethod",
	"qrOpensBeforeMinutes",
	"qrClosesAfterMinutes",
	"trainers",
	"audience",
	"sessions",
] as const;

export type CourseFormIds = ReturnType<typeof useCourseFormIds>;

export const useCourseFormIds = () => useFormIds(FIELD_KEYS);
