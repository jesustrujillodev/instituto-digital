export { action } from "./index.action";
export { loader } from "./index.loader";

import { UserCog } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import {
	FormActions,
	FormFooter,
} from "@/shared/components/common/form-actions";
import { PageHeader } from "@/shared/components/common/page-header";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { AssignHeadDialog } from "../../../components/assign-head-dialog";
import { DependencyStatusBadge } from "../../../components/dependency-badges";
import { DependencyForm } from "../../../components/dependency-form";
import { useDependencyFormIds } from "../../../hooks/use-dependency-form-ids";
import type { DependencyActionData } from "../../../utils/parse-dependency-form-data";
import type { Route } from "./+types/index";

const LIST_PATH = "/dashboard/dependencias";

export const handle = {
	breadcrumb: () => [
		{ label: "Dependencias", path: LIST_PATH },
		{ label: "Editar" },
	],
} satisfies BreadcrumbHandle;

export function meta() {
	return [{ title: "Editar dependencia" }];
}

const nameOf = (candidate: {
	firstName: string | null;
	lastName: string | null;
	email: string;
}) =>
	[candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim() ||
	candidate.email;

export default function EditarDependenciaPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { dependency, candidates },
	} = loaderData;
	const ids = useDependencyFormIds();
	const [assigningHead, setAssigningHead] = useState(false);

	// El fetcher del formulario es distinto del que usa el diálogo: son dos
	// mutaciones con intenciones distintas y su estado de envío no debe mezclarse
	// (guardar unas siglas no tiene que dejar el botón de designar en "Designando").
	const fetcher = useFetcher<DependencyActionData>();
	const isSubmitting = fetcher.state !== "idle";

	useFetcherToast(fetcher, {
		errorMessage: "No se pudo actualizar la dependencia",
	});

	const currentHead = candidates.find((candidate) => candidate.isHead) ?? null;

	const actions = (
		<FormActions
			formId={ids.form}
			isSubmitting={isSubmitting}
			submitLabel="Guardar cambios"
			submittingLabel="Guardando…"
			cancelTo={LIST_PATH}
		/>
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				title={dependency.name}
				description="Datos de la dependencia y designación de su titular."
				goBack={LIST_PATH}
				actions={actions}
				collapseActionsOnMobile
			/>

			<div className="mb-4">
				<DependencyStatusBadge archivedAt={dependency.archivedAt} />
			</div>

			<DependencyForm
				mode="edit"
				ids={ids}
				fetcher={fetcher}
				dependency={dependency}
			/>

			{/* La titularidad va fuera del formulario: no es un campo que se guarde
			    con los demás, es un relevo que cambia el rol de dos cuentas y les
			    cierra la sesión. */}
			<Card className="mt-4">
				<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col gap-1">
						<span className="font-medium text-foreground text-sm">Titular</span>
						<span className="text-muted-foreground text-sm">
							{currentHead
								? nameOf(currentHead)
								: "Sin titular. Designa a alguien de su personal."}
						</span>
					</div>

					<Button
						variant="outline"
						onClick={() => setAssigningHead(true)}
						// Una dependencia desactivada no recibe titular: sería darle quien
						// la administre a una unidad que ya no opera. El servicio impone la
						// misma regla; aquí solo se evita ofrecer lo que fallaría.
						disabled={Boolean(dependency.archivedAt)}
					>
						<UserCog className="h-4 w-4" />
						{currentHead ? "Cambiar titular" : "Designar titular"}
					</Button>
				</CardContent>
			</Card>

			<AssignHeadDialog
				open={assigningHead}
				onOpenChange={setAssigningHead}
				candidates={candidates}
			/>

			<FormFooter>{actions}</FormFooter>
		</div>
	);
}
