export { action } from "./index.action";
export { loader } from "./index.loader";

import type { ShouldRevalidateFunction } from "react-router";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseWizardScreen } from "../../../components/course-wizard-screen";
import { shouldRevalidateCourseStep } from "../../../utils/parse-course-form-data";
import type { Route } from "./+types/index";

export const shouldRevalidate: ShouldRevalidateFunction =
	shouldRevalidateCourseStep;

const LIST_PATH = "/dashboard/capacitaciones";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Capacitaciones", path: LIST_PATH },
		loaderData
			? {
					label: loaderData.data.course.title,
					path: `${LIST_PATH}/${loaderData.data.course.documentId}`,
				}
			: { label: "Capacitación" },
		{ label: "Editar" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	const title = data?.data.course.title;
	return [{ title: title ? `Editar · ${title}` : "Editar capacitación" }];
}

export default function CursoEditarPasoPage({
	loaderData,
}: Route.ComponentProps) {
	return <CourseWizardScreen mode="edit" data={loaderData.data} />;
}
