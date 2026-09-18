export { action } from "./index.action";
export { loader } from "./index.loader";

import { useFetcher, useNavigate } from "react-router";
import { FormActions } from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseForm } from "../../../components/course-form";
import { CourseSaveBar } from "../../../components/course-save-bar";
import { useCourseFormIds } from "../../../hooks/use-course-form-ids";
import type { CourseActionData } from "../../../utils/parse-course-form-data";
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

export default function CursoEditarPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { course, options },
	} = loaderData;
	const navigate = useNavigate();
	const ids = useCourseFormIds();
	const detailPath = `${LIST_PATH}/${course.documentId}`;

	const fetcher = useFetcher<CourseActionData>();
	useFetcherToast(fetcher, {
		errorMessage: "No se pudo guardar el curso",
		onSuccess: () => navigate(detailPath),
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={fetcher.state !== "idle"}
			submitLabel="Guardar cambios"
			submittingLabel="Guardando…"
			cancelTo={detailPath}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Editar curso"
				description={course.title}
				goBack={detailPath}
				actions={actions}
				actionsClassName="hidden md:flex"
			/>

			<CourseForm
				mode="edit"
				ids={ids}
				fetcher={fetcher}
				options={options}
				course={course}
			/>

			<CourseSaveBar>{actions}</CourseSaveBar>
		</div>
	);
}
