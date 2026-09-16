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
import { ExternalTrainerForm } from "../../../components/external-trainer-form";
import { useExternalTrainerFormIds } from "../../../hooks/use-trainer-form-ids";
import type { TrainerActionData } from "../../../utils/parse-trainer-form-data";

const LIST_PATH = "/dashboard/capacitadores";

export const handle = {
	breadcrumb: () => [
		{ label: "Capacitadores", path: LIST_PATH },
		{ label: "Capacitador externo" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Nuevo capacitador externo" }];
}

export default function NuevoCapacitadorPage() {
	const navigate = useNavigate();
	const ids = useExternalTrainerFormIds();

	// El fetcher vive en la ruta para que los botones de guardar puedan estar
	// fuera del <form> y aun así conocer el estado del envío.
	const fetcher = useFetcher<TrainerActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudo registrar al capacitador",
		onSuccess: () => navigate(LIST_PATH),
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Registrar capacitador"
			submittingLabel="Registrando…"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Nuevo capacitador externo"
				description="Cuenta sin dependencia ni número de empleado. Solo imparte: no crea cursos, no se inscribe y no acumula créditos."
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<ExternalTrainerForm ids={ids} fetcher={fetcher} />

			<FormFooter>{actions}</FormFooter>
		</div>
	);
}
