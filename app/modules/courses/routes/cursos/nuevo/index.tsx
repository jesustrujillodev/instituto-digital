export { action } from "./index.action";
export { loader } from "./index.loader";

import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseWizard } from "../../../components/course-wizard";
import { useCourseFormIds } from "../../../hooks/use-course-form-ids";
import { stepOfKey } from "../../../utils/course-wizard-steps";
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

/** Paso 1 del alta: el único que corre sin curso todavía. */
export default function NuevoCursoPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { options, prefill },
	} = loaderData;
	const ids = useCourseFormIds();

	return (
		<CourseWizard
			step={stepOfKey("identity")}
			ids={ids}
			options={options}
			prefill={prefill}
			notice={
				prefill && (
					<Alert>
						<AlertDescription>
							El curso se vinculará a la línea «{prefill.title}» del plan anual{" "}
							{prefill.fiscalYear}.
						</AlertDescription>
					</Alert>
				)
			}
		/>
	);
}
