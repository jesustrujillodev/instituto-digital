export { action } from "./index.action";
export { loader } from "./index.loader";

import { useFetcher, useNavigate } from "react-router";
import { FormActions } from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseForm } from "../../../components/course-form";
import { CourseSaveBar } from "../../../components/course-save-bar";
import { useCourseFormIds } from "../../../hooks/use-course-form-ids";
import type { CourseCreateActionData } from "../../../utils/parse-course-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/cursos";

export const handle = {
	breadcrumb: () => [
		{ label: "Cursos", path: LIST_PATH },
		{ label: "Nuevo curso" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Nuevo curso" }];
}

export default function NuevoCursoPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { options, prefill },
	} = loaderData;
	const navigate = useNavigate();
	const ids = useCourseFormIds();

	const fetcher = useFetcher<CourseCreateActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudo crear el curso",
		onSuccess: () => {
			if (fetcher.data?.success) {
				navigate(`${LIST_PATH}/${fetcher.data.data.documentId}`);
			}
		},
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Guardar borrador"
			submittingLabel="Guardando…"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Nuevo curso"
				description="Se guarda como borrador: puedes dejarlo incompleto y publicarlo desde su ficha."
				goBack={LIST_PATH}
				actions={actions}
				actionsClassName="hidden md:flex"
			/>

			{prefill && (
				<Alert className="mb-4">
					<AlertDescription>
						El curso se vinculará a la línea «{prefill.title}» del plan anual{" "}
						{prefill.fiscalYear}.
					</AlertDescription>
				</Alert>
			)}

			<CourseForm
				mode="create"
				ids={ids}
				fetcher={fetcher}
				options={options}
				prefill={prefill}
			/>

			<CourseSaveBar>{actions}</CourseSaveBar>
		</div>
	);
}
