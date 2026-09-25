import { useSearchParams } from "react-router";
import { QuizEditor } from "@/modules/content/components/quiz-editor";
import { EvaluationDefinitions } from "@/modules/evaluations/components/evaluation-definitions";
import { useCourseFormIds } from "../hooks/use-course-form-ids";
import type { loadCourseWizard } from "../routes/course-wizard.server";
import {
	type CourseWizardMode,
	editReturnPath,
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
	const { course, options, stepNumber, checklist, content, evaluations, quiz } =
		data;
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
			finishTo={finishReturnPath(course.documentId, returnTo)}
			search={
				returnTo ? `?${RETURN_PARAM}=${encodeURIComponent(returnTo)}` : ""
			}
			evaluationTitles={evaluations.map((evaluation) => evaluation.title)}
			quizQuestionCount={quiz?.questions.length ?? 0}
			quiz={(bindings) => (
				<QuizEditor
					courseDocumentId={course.documentId}
					bank={quiz}
					defaultTitle={`Examen final · ${course.title}`}
					{...bindings}
				/>
			)}
			evaluations={
				<EvaluationDefinitions
					courseDocumentId={course.documentId}
					evaluations={evaluations}
					sessions={course.sessions}
				/>
			}
		/>
	);
}
