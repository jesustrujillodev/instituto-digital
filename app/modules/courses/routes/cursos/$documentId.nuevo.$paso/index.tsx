export { action } from "./index.action";
export { loader } from "./index.loader";

import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseWizard } from "../../../components/course-wizard";
import { useCourseFormIds } from "../../../hooks/use-course-form-ids";
import {
	COURSE_WIZARD_STEPS,
	LAST_STEP_NUMBER,
} from "../../../utils/course-wizard-steps";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/cursos";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Cursos", path: LIST_PATH },
		loaderData
			? {
					label: loaderData.data.course.title,
					path: `${LIST_PATH}/${loaderData.data.course.documentId}`,
				}
			: { label: "Curso" },
		{ label: "Alta" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	const step = data?.data.stepNumber;
	return [
		{
			title: step
				? `Paso ${step} de ${LAST_STEP_NUMBER} · ${data?.data.course.title}`
				: "Alta de curso",
		},
	];
}

export default function CursoAltaPasoPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { course, options, stepNumber, checklist },
	} = loaderData;
	const ids = useCourseFormIds();

	const step = COURSE_WIZARD_STEPS[stepNumber - 1];

	return (
		<CourseWizard
			key={stepNumber}
			step={step}
			ids={ids}
			options={options}
			course={course}
			checklist={checklist}
		/>
	);
}
