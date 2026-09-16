export { action } from "./index.action";
export { loader } from "./index.loader";

import { useFetcher, useNavigate } from "react-router";
import {
	FormActions,
	FormFooter,
} from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { DependencyForm } from "../../../components/dependency-form";
import { useDependencyFormIds } from "../../../hooks/use-dependency-form-ids";
import type { DependencyActionData } from "../../../utils/parse-dependency-form-data";

const LIST_PATH = "/dashboard/dependencias";

export const handle = {
	breadcrumb: () => [
		{ label: "Dependencias", path: LIST_PATH },
		{ label: "Nueva dependencia" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Nueva dependencia" }];
}

export default function NuevaDependenciaPage() {
	const navigate = useNavigate();
	const ids = useDependencyFormIds();

	// El fetcher vive en la ruta —y no dentro de DependencyForm— para que los
	// botones de guardar puedan estar fuera del <form> (en el PageHeader y al pie)
	// y aun así conocer el estado del envío.
	const fetcher = useFetcher<DependencyActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudo crear la dependencia",
		onSuccess: () => navigate(LIST_PATH),
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Crear dependencia"
			submittingLabel="Creando…"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Nueva dependencia"
				description="Registra una unidad organizativa. El titular se designa después, cuando tenga personal adscrito."
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<DependencyForm mode="create" ids={ids} fetcher={fetcher} />

			<FormFooter>{actions}</FormFooter>
		</div>
	);
}
