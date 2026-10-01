import { useSearchParams } from "react-router";
import { FollowUpList } from "@/modules/content/components/follow-up-list";
import { QuizEditor } from "@/modules/content/components/quiz-editor";
import { useCourseFormIds } from "../hooks/use-course-form-ids";
import type { loadCourseWizard } from "../routes/course-wizard.server";
import {
	type CourseWizardMode,
	editReturnLabel,
	editReturnPath,
	finishReturnLabel,
	finishReturnPath,
	RETURN_PARAM,
	stepOfNumber,
} from "../utils/course-wizard-steps";
import { CourseWizard } from "./course-wizard";

type WizardData = Awaited<ReturnType<typeof loadCourseWizard>>["data"];

/** Un paso del alta o de la edición, con lo que la ruta ya cargó. */
export function CourseWizardScreen({
	mode,
	data,
}: {
	mode: CourseWizardMode;
	data: WizardData;
}) {
	const {
		course,
		options,
		stepNumber,
		checklist,
		content,
		followUps,
		followUpBanks,
		quiz,
		quizQuestionCount,
	} = data;
	const ids = useCourseFormIds();
	const [searchParams] = useSearchParams();

	const step = stepOfNumber(stepNumber);
	if (!step) return null;

	const returnTo = searchParams.get(RETURN_PARAM);

	return (
		<CourseWizard
			key={stepNumber}
			mode={mode}
			step={step}
			ids={ids}
			options={options}
			course={course}
			checklist={checklist}
			content={content}
			exitTo={
				mode === "edit"
					? editReturnPath(course.documentId, returnTo)
					: undefined
			}
			exitLabel={mode === "edit" ? editReturnLabel(returnTo) : undefined}
			finishTo={finishReturnPath(course.documentId, returnTo)}
			finishLabel={finishReturnLabel(returnTo)}
			search={
				returnTo ? `?${RETURN_PARAM}=${encodeURIComponent(returnTo)}` : ""
			}
			followUpTitles={followUps.map((followUp) => followUp.title)}
			countedFollowUpTitles={followUps
				.filter((followUp) => followUp.countsTowardGrade)
				.map((followUp) => followUp.title)}
			quizQuestionCount={quizQuestionCount}
			quiz={(bindings) => (
				<QuizEditor
					courseDocumentId={course.documentId}
					bank={quiz}
					defaultTitle={`Examen final · ${course.title}`}
					{...bindings}
				/>
			)}
			followUps={(bindings) => (
				<FollowUpList
					courseDocumentId={course.documentId}
					followUps={followUps}
					banks={followUpBanks}
					sessions={course.sessions}
					{...bindings}
				/>
			)}
		/>
	);
}
