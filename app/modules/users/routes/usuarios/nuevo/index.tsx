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
import { UserForm } from "../../../components/user-form";
import { useUserFormIds } from "../../../hooks/use-user-form-ids";
import type { UserActionData } from "../../../utils/parse-user-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/usuarios";

export const handle = {
	breadcrumb: () => [
		{ label: "Usuarios", path: LIST_PATH },
		{ label: "Nuevo usuario" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Nuevo usuario" }];
}

export default function NuevoUsuarioPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { assignableRoles, dependencies, canChooseDependency },
	} = loaderData;
	const navigate = useNavigate();
	const ids = useUserFormIds();

	// El fetcher vive en la ruta —y no dentro de UserForm— para que los botones de
	// guardar puedan estar fuera del <form> (en el PageHeader y al pie) y aun así
	// conocer el estado del envío.
	const fetcher = useFetcher<UserActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudo crear el usuario",
		onSuccess: () => navigate(LIST_PATH),
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Crear usuario"
			submittingLabel="Creando…"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Nuevo usuario"
				description="Crea una cuenta con acceso a la herramienta."
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<UserForm
				mode="create"
				ids={ids}
				fetcher={fetcher}
				assignableRoles={assignableRoles}
				dependencies={dependencies}
				canChooseDependency={canChooseDependency}
			/>

			<FormFooter>{actions}</FormFooter>
		</div>
	);
}
