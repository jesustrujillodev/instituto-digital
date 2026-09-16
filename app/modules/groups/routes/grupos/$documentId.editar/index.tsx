export { action } from "./index.action";
export { loader } from "./index.loader";

import { useFetcher } from "react-router";
import {
	FormActions,
	FormFooter,
} from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { GroupStatusBadge } from "../../../components/group-badges";
import { GroupForm } from "../../../components/group-form";
import { GroupMembers } from "../../../components/group-members";
import { useGroupFormIds } from "../../../hooks/use-group-form-ids";
import type { GroupActionData } from "../../../utils/parse-group-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/grupos";

export const handle = {
	breadcrumb: () => [{ label: "Grupos", path: LIST_PATH }, { label: "Grupo" }],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Grupo" }];
}

export default function GrupoEditarPage({ loaderData }: Route.ComponentProps) {
	const {
		data: { group, members, candidates, canManage, memberSearch },
	} = loaderData;
	const ids = useGroupFormIds();

	const fetcher = useFetcher<GroupActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, { errorMessage: "No se pudo actualizar el grupo" });

	const actions = canManage ? (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Guardar cambios"
			submittingLabel="Guardando…"
			cancelTo={LIST_PATH}
		/>
	) : null;

	return (
		<div className="flex flex-col">
			<PageHeader
				title={group.name}
				description={group.description ?? "Sin descripción"}
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<div className="mb-4">
				<GroupStatusBadge archivedAt={group.archivedAt} />
			</div>

			<div className="flex flex-col gap-4">
				{canManage && (
					<GroupForm mode="edit" ids={ids} fetcher={fetcher} group={group} />
				)}

				<GroupMembers
					members={members}
					candidates={candidates}
					memberSearch={memberSearch}
					canManage={canManage}
					dependencyName={group.dependencyName}
				/>
			</div>

			{actions && <FormFooter>{actions}</FormFooter>}
		</div>
	);
}
