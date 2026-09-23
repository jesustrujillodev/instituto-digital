export { action } from "./index.action";
export { loader } from "./index.loader";

import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseWizardScreen } from "../../../components/course-wizard-screen";
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
		{ label: "Editar" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	const title = data?.data.course.title;
	return [{ title: title ? `Editar · ${title}` : "Editar curso" }];
}

export default function CursoEditarPasoPage({
	loaderData,
}: Route.ComponentProps) {
	return <CourseWizardScreen mode="edit" data={loaderData.data} />;
}
