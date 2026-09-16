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
import { GroupForm } from "../../../components/group-form";
import { useGroupFormIds } from "../../../hooks/use-group-form-ids";
import type { GroupActionData } from "../../../utils/parse-group-form-data";

const LIST_PATH = "/dashboard/grupos";

export const handle = {
	breadcrumb: () => [
		{ label: "Grupos", path: LIST_PATH },
		{ label: "Nuevo grupo" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Nuevo grupo" }];
}

export default function NuevoGrupoPage() {
	const navigate = useNavigate();
	const ids = useGroupFormIds();

	const fetcher = useFetcher<GroupActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudo crear el grupo",
		onSuccess: () => navigate(LIST_PATH),
	});

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Crear grupo"
			submittingLabel="Creando…"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title="Nuevo grupo"
				description="Pertenece a tu dependencia. Los miembros se agregan después, desde su ficha."
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<GroupForm mode="create" ids={ids} fetcher={fetcher} />

			<FormFooter>{actions}</FormFooter>
		</div>
	);
}
