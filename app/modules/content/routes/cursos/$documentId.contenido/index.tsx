export { action } from "./index.action";
export { loader } from "./index.loader";

import { PageHeader } from "@/shared/components/common/page-header";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseContentPanel } from "../../../components/course-content-panel";
import type { Route } from "./+types/index";

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
		{ label: "Contenido" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: data ? `Contenido · ${data.data.course.title}` : "Contenido",
		},
	];
}

export default function CursoContenidoPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { course, tree, canWrite, canDelete },
	} = loaderData;

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Contenido"
				description="Los módulos y las lecciones que se recorren."
				goBack={`${LIST_PATH}/${course.documentId}`}
			/>

			<CourseContentPanel
				courseDocumentId={course.documentId}
				tree={tree}
				canWrite={canWrite}
				canDelete={canDelete}
			/>
		</div>
	);
}
