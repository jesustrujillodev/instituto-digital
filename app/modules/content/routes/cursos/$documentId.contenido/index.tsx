export { action } from "./index.action";
export { loader } from "./index.loader";

import { PageHeader } from "@/shared/components/common/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseContentManager } from "../../../components/course-content-manager";
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
		data: { course, tree, canWrite },
	} = loaderData;

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Contenido"
				description="Los módulos y las lecciones que se recorren. Cada cambio se guarda al momento."
				goBack={`${LIST_PATH}/${course.documentId}`}
			/>

			<Card>
				<CardContent>
					<CourseContentManager
						courseDocumentId={course.documentId}
						tree={tree}
						canWrite={canWrite}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
