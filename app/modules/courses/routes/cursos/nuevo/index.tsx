export { action } from "./index.action";
export { loader } from "./index.loader";

import type { ShouldRevalidateFunction } from "react-router";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { CourseWizard } from "../../../components/course-wizard";
import { useCourseFormIds } from "../../../hooks/use-course-form-ids";
import { stepOfKey } from "../../../utils/course-wizard-steps";
import { shouldRevalidateCourseStep } from "../../../utils/parse-course-form-data";
import type { Route } from "./+types/index";

export const shouldRevalidate: ShouldRevalidateFunction =
	shouldRevalidateCourseStep;

const LIST_PATH = "/dashboard/capacitaciones";

export const handle = {
	breadcrumb: () => [
		{ label: "Capacitaciones", path: LIST_PATH },
		{ label: "Nueva capacitación" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Nueva capacitación" }];
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
		/>
	);
}
