export { action } from "./index.action";
export { loader } from "./index.loader";

import type { ShouldRevalidateFunction } from "react-router";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseWizardScreen } from "../../../components/course-wizard-screen";
import {
	stepOfNumber,
	stepPosition,
	stepsFor,
} from "../../../utils/course-wizard-steps";
import { shouldRevalidateAfterPublish } from "../../../utils/parse-course-form-data";
import type { Route } from "./+types/index";

export const shouldRevalidate: ShouldRevalidateFunction =
	shouldRevalidateAfterPublish;

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

	const { position, total } = stepPosition(stepsFor(course), step);

	return [{ title: `Paso ${position} de ${total} · ${course.title}` }];
}

export default function CursoAltaPasoPage({
	loaderData,
}: Route.ComponentProps) {
	return <CourseWizardScreen mode="create" data={loaderData.data} />;
}
