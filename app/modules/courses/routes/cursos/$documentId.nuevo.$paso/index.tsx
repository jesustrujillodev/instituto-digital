export { action } from "./index.action";
export { loader } from "./index.loader";

import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseWizard } from "../../../components/course-wizard";
import { useCourseFormIds } from "../../../hooks/use-course-form-ids";
import {
	stepOfNumber,
	stepPosition,
	stepsForFormat,
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
	const course = data?.data.course;
	const step = course && stepOfNumber(data.data.stepNumber);

	if (!course || !step) return [{ title: "Alta de curso" }];

	const { position, total } = stepPosition(stepsForFormat(course.format), step);

	return [{ title: `Paso ${position} de ${total} · ${course.title}` }];
}

export default function CursoAltaPasoPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { course, options, stepNumber, checklist, content },
	} = loaderData;
	const ids = useCourseFormIds();

	const step = stepOfNumber(stepNumber);
	if (!step) return null;

	return (
		<CourseWizard
			key={stepNumber}
			step={step}
			ids={ids}
			options={options}
			course={course}
			checklist={checklist}
			content={content}
		/>
	);
}
