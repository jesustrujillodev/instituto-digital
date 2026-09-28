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
import { TRAINERS_LIST_PATH } from "../../../utils/trainer-profile-paths";

const USERS_PATH = "/dashboard/usuarios";

export const handle = {
	breadcrumb: () => [
		{ label: "Usuarios", path: USERS_PATH },
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
		// Vuelve a la tabla ya filtrada: la persona recién registrada aparece entre
		// los capacitadores sin tener que buscarla.
		onSuccess: () => navigate(TRAINERS_LIST_PATH),
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Registrar capacitador"
			submittingLabel="Registrando…"
			cancelTo={USERS_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Nuevo capacitador externo"
				description="Para quien imparte desde fuera del Ayuntamiento. No pertenece a ninguna dependencia: solo imparte los cursos a los que se le asigna; no crea cursos, no se inscribe ni acumula créditos."
				goBack={USERS_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<ExternalTrainerForm ids={ids} fetcher={fetcher} />

			<FormFooter>{actions}</FormFooter>
		</div>
	);
}
